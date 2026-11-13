// Package usecase — orkestrasi sesi bastion: redeem ticket (HMAC ke
// osc_rest) → dial SSH target → pump terminal dua arah dengan
// **Command ACL Blacklist real-time** → rekam asciicast → unggah ke
// osc_rest (RustFS bucket privat). Bergantung hanya port domain.
//
// Jaminan keamanan inti:
//   - Kredensial target (plaintext) hidup di memori sesi saja, tidak
//     pernah ditulis log/frame WS ke browser; di-zero-ize setelah auth.
//   - Input browser di-buffer sampai newline; baris DIBLOKIR tidak
//     pernah mencapai remote (deny sebelum eksekusi).
//   - Rekaman berisi input yang lolos ACL + seluruh output remote.
package usecase

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

// Batas kontrak protokol WS (memirror konstanta gorilla/websocket tanpa
// import di layer dalam).
const (
	// wsMsgText / wsMsgBinary — tipe frame WebSocket.
	wsMsgText   = 1
	wsMsgBinary = 2
	// maxInputBuffer — baris perintah realistis < 16 KiB.
	maxInputBuffer = 16 << 10
)

// sessionLimiter — penghitung sesi konkuren global.
type sessionLimiter struct{ cur atomic.Int64 }

// tryAcquire mengembalikan false bila batas tercapai.
func (l *sessionLimiter) tryAcquire(max int64) bool {
	for {
		cur := l.cur.Load()
		if cur >= max {
			return false
		}
		if l.cur.CompareAndSwap(cur, cur+1) {
			return true
		}
	}
}
func (l *sessionLimiter) release() { l.cur.Add(-1) }

// BastionService use case inti gateway.
type BastionService struct {
	api         domain.RustAPIClient
	dialer      domain.SSHDialer
	logger      *slog.Logger
	maxSessions int64
	limiter     sessionLimiter
}

// NewBastionService membangun use case.
func NewBastionService(api domain.RustAPIClient, dialer domain.SSHDialer,
	maxSessions int64, logger *slog.Logger) *BastionService {
	if maxSessions <= 0 {
		maxSessions = 20
	}
	return &BastionService{api: api, dialer: dialer, logger: logger, maxSessions: maxSessions}
}

// lineBuf — buffer baris input untuk evaluasi ACL newline-delimited.
// Keystroke tiba sebagai banyak pesan kecil; buffer bertahan per sesi
// hingga newline supaya baris penuh bisa dievaluasi.
type lineBuf struct {
	b   []byte
	max int
}

// feed menambah byte; mengembalikan baris-baris lengkap (salinan, tanpa
// newline) untuk evaluasi ACL. Buffer penuh tanpa newline → overflow: buffer
// dibuang dan sisa chunk saat ini dijatuhkan (baris terlalu panjang dibuang
// utuh — keystroke berikutnya mulai baris baru). Keystroke tiba
// per-byte/per-chunk; buffer bertahan per sesi hingga newline.
func (lb *lineBuf) feed(p []byte) (lines [][]byte, overflow bool) {
	for _, c := range p {
		if c == '\n' {
			line := make([]byte, len(lb.b))
			copy(line, lb.b)
			lines = append(lines, line)
			lb.reset()
			continue
		}
		if len(lb.b) >= lb.max {
			// Overflow: buang buffer + sisa chunk (baris terlalu panjang).
			overflow = true
			lb.reset()
			return lines, overflow
		}
		lb.b = append(lb.b, c)
	}
	return lines, overflow
}

func (lb *lineBuf) reset() { lb.b = lb.b[:0] }

func indexByte(b []byte, c byte) int {
	for i, x := range b {
		if x == c {
			return i
		}
	}
	return -1
}

// handshake — frame pertama browser: {"session_id": uuid, "ticket": hex}.
// Ticket plaintext hanya hidup di memori sesi ini; tidak di-log.
type handshake struct {
	SessionID string `json:"session_id"`
	Ticket    string `json:"ticket"`
}

// HandleSession menjalankan satu sesi bastion penuh sampai selesai:
// 1) handshake ticket → 2) redeem → 3) dial SSH → 4) pump+ACL+record
// → 5) finalize + upload rekaman. BLOCKING; satu goroutine per sesi.
func (s *BastionService) HandleSession(ctx context.Context, stream domain.TerminalStream, started time.Time) {
	if !s.limiter.tryAcquire(s.maxSessions) {
		s.writeNotice(stream, domain.Notice("batas sesi konkuren tercapai — coba lagi nanti"))
		_ = stream.Close()
		return
	}
	defer s.limiter.release()

	if err := stream.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
		_ = stream.Close()
		return
	}
	_, data, err := stream.ReadMessage()
	if err != nil || stream.SetReadDeadline(time.Time{}) != nil {
		_ = stream.Close()
		return
	}
	var hs handshake
	if err := json.Unmarshal(data, &hs); err != nil || hs.Ticket == "" || len(hs.Ticket) > 128 {
		s.writeNotice(stream, domain.Notice(`handshake tidak valid (kirim JSON {"session_id","ticket"})`))
		_ = stream.Close()
		return
	}

	res, err := s.api.RedeemTicket(ctx, domain.RedeemTicketRequest{
		SessionID: hs.SessionID, Ticket: hs.Ticket,
	})
	if err != nil {
		s.logger.Warn("redeem ticket gagal", "err", err.Error())
		s.writeNotice(stream, domain.Notice("ticket tidak valid ("+classify(err)+")"))
		_ = stream.Close()
		return
	}
	corrLogger := s.logger.With("session_id", res.SessionID)
	zeroString(hs.Ticket) // ticket plaintext tidak perlu hidup lebih lama

	// Sesi dibatasi max_session_minutes policy (cap absolut 480 menit).
	sessCtx, cancel := context.WithTimeout(ctx, res.Policy.SessionDeadline())
	defer cancel()

	sshClient, err := s.dialer.Dial(sessCtx, res.Target, res.Account)
	// res.Account.Secret sudah di-zero-ize di dalam ssh.Dial setelah auth.
	if err != nil {
		corrLogger.Warn("dial SSH target gagal", "host", res.Target.Host, "err", err.Error())
		s.writeNotice(stream, domain.Notice("gagal terhubung ke target ("+classify(err)+")"))
		_ = stream.Close()
		return
	}
	defer sshClient.Close()

	shell, err := sshClient.OpenPTY(24, 80, "xterm-256color")
	if err != nil {
		corrLogger.Error("open pty gagal", "err", err.Error())
		s.writeNotice(stream, domain.Notice("target menolak pty/shell"))
		_ = stream.Close()
		return
	}
	defer shell.Close()

	recorder := NewRecorder(started)
	recorder.Start("xterm-256color", 24, 80)
	s.writeNotice(stream, domain.Notice("sesi PAM aktif — seluruh aktivitas direkam untuk audit"))
	recorder.Output(domain.Notice("sesi PAM aktif — rekaman sesi diarsipkan (immutable)"))

	// 4) Pump dua arah.
	binDone := make(chan struct{}) // remote → browser selesai
	inDone := make(chan struct{})  // browser → remote selesai

	go func() {
		defer close(binDone)
		for {
			select {
			case <-sessCtx.Done():
				return
			case chunk, open := <-shell.StdoutPipe():
				if !open {
					return
				}
				recorder.Output(chunk)
				if err := stream.WriteMessage(wsMsgBinary, chunk); err != nil {
					return
				}
			}
		}
	}()

	lb := &lineBuf{max: maxInputBuffer}
	go func() {
		defer close(inDone)
		for {
			msgType, data, err := stream.ReadMessage()
			if err != nil {
				return
			}
			if msgType == wsMsgText {
				s.handleControl(shell, data)
				continue
			}
			lines, overflow := lb.feed(data)
			for _, line := range lines {
				s.evalAndForward(shell, stream, recorder, res.Policy.CommandFilter, line, corrLogger)
			}
			if overflow {
				lb.reset()
				s.writeNotice(stream, domain.Notice("baris perintah terlalu panjang — buffer dibuang"))
			}
		}
	}()

	select {
	case <-sessCtx.Done():
		corrLogger.Info("sesi berakhir (batas waktu policy tercapai)")
	case <-inDone:
		corrLogger.Debug("browser terputus")
	case <-binDone:
		corrLogger.Debug("sesi remote selesai")
	case <-ctx.Done():
	}

	// Drain output yang tersisa (mulai baru bila binDone belum tuntas) —
	// pump output tetap berjalan sampai channel shell tutup; beri jeda
	// kecil agar byte terakhir ter-catat sebelum upload.
	select {
	case <-binDone:
	default:
		time.Sleep(250 * time.Millisecond)
	}

	// 5) Finalize + upload rekaman (immutable → bucket privat RustFS).
	body, shaHex, truncated, ferr := recorder.Finalize()
	if ferr != nil {
		corrLogger.Error("finalisasi rekaman gagal — rekaman hilang", "err", ferr.Error())
	} else if len(body) > 0 {
		rec, uerr := s.api.UploadRecording(sessCtx, res.SessionID, domain.RecordingFormatCastGZ, body)
		switch {
		case uerr == nil:
			corrLogger.Info("rekaman sesi terunggah",
				"object_key", rec.ObjectKey, "bucket", rec.Bucket,
				"size_bytes", rec.SizeBytes, "sha256", rec.SHA256)
		case sessCtx.Err() != nil || ctx.Err() != nil:
			corrLogger.Warn("upload rekaman dibatalkan (sesi timeout)")
		default:
			corrLogger.Error("upload rekaman gagal — rekaman harus di-re-upload manual",
				"err", uerr.Error(), "size_bytes", len(body), "sha256", shaHex)
		}
	}
	if truncated {
		corrLogger.Warn("rekaman terpotong (batas ukuran CAST_GZ tercapai)")
	}
	corrLogger.Info("sesi bastion ditutup")
	_ = stream.Close()
}

// evalAndForward mengevaluasi satu baris penuh terhadap Command ACL
// lalu meneruskannya ke remote atau memblokir secara real-time.
func (s *BastionService) evalAndForward(shell domain.ShellSession, stream domain.TerminalStream,
	recorder *Recorder, filter *domain.CommandFilter, line []byte, corrLogger *slog.Logger) {
	cmd := strings.TrimSpace(string(line))
	if cmd == "" {
		// Baris kosong / newline polos → teruskan apa adanya.
		_ = shell.StdinWrite([]byte{'\r'})
		return
	}
	decision := filter.Evaluate(cmd)
	if decision.Decision == domain.ACLDeny {
		corrLogger.Warn("perintah diblokir Command ACL",
			"rule", decision.Rule, "reason", decision.Reason, "command", cmd)
		recorder.Output(domain.BlockNotice(cmd))
		_ = stream.WriteMessage(wsMsgBinary, domain.BlockNotice(cmd))
		return
	}
	recorder.Input(append(append([]byte{}, line...), '\n'))
	if err := shell.StdinWrite(append(append([]byte{}, line...), '\r')); err != nil {
		corrLogger.Debug("stdin write gagal (remote mungkin mati)", "err", err.Error())
	}
}

// handleControl memproses frame teks JSON dari browser (resize terminal).
func (s *BastionService) handleControl(shell domain.ShellSession, data []byte) {
	var c struct {
		Type string `json:"type"`
		Cols int    `json:"cols"`
		Rows int    `json:"rows"`
	}
	if err := json.Unmarshal(data, &c); err != nil || c.Type != "resize" {
		return
	}
	if c.Rows > 0 && c.Rows <= 200 && c.Cols > 0 && c.Cols <= 500 {
		_ = shell.Resize(c.Rows, c.Cols)
	}
}

// writeNotice — pesan info ke browser (frame binary, teks ANSI).
func (s *BastionService) writeNotice(stream domain.TerminalStream, msg []byte) {
	_ = stream.WriteMessage(wsMsgBinary, msg)
}

// classify mereduksi error domain menjadi label singkat untuk browser
// (tanpa membocorkan detail infra).
func classify(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, domain.ErrTicketUsed.Error()):
		return "ticket sudah pernah dipakai"
	case strings.Contains(msg, domain.ErrUnauthorized.Error()):
		return "ticket salah/kedaluwarsa"
	case strings.Contains(msg, domain.ErrUnreachable.Error()):
		return "target tidak terjangkau"
	case strings.Contains(msg, domain.ErrUnsupportedAccount.Error()):
		return "tipe akun tidak didukung bastion SSH"
	case strings.Contains(msg, domain.ErrHostKeyUnknownFirstUse.Error()):
		return "host key target belum terverifikasi"
	default:
		return "internal"
	}
}

// zeroString menimpa salinan byte string (Go string immutable — yang
// bisa dikendalikan adalah salinan []byte-nya).
func zeroString(s string) {
	b := []byte(s)
	for i := range b {
		b[i] = 0
	}
}
