// Package ssh — adapter klien SSH ke target akun vault (implementasi
// port domain.SSHDialer). Kredensial diterima sebagai []byte dan
// di-zero-ize setelah auth. Host key diverifikasi known_hosts dengan
// pola Trust-On-First-Use (TOFU): fingerprint pertama disimpan ke file
// 0600; koneksi berikutnya wajib cocok (mismatch = tolak keras).
//
// Tidak ada exec.Command / shell — protokol SSH dijalankan langsung
// melalui x/crypto/ssh (channel pty-req + shell).
package ssh

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

const (
	dialTimeout = 10 * time.Second
	// keepaliveInterval — probe keepalive@openssh.com agar sesi mati
	// terdeteksi (NAT/firewall idle drop) tanpa menunggu baca timeout.
	keepaliveInterval = 30 * time.Second
	// outChunkSize — ukuran chunk baca stdout untuk streaming.
	outChunkSize = 16 << 10 // 16 KiB
)

// Dialer implementasi domain.SSHDialer.
type Dialer struct {
	knownHostsPath string // kosong → verifikasi host key ditolak (fail-safe)
	logger         *slog.Logger
}

// NewDialer membangun dialer. knownHostsPath wajib di produksi (env
// PAM_GATEWAY_KNOWN_HOSTS); kosong → semua koneksi ditolak dengan log
// peringatan (anti MITM diam-diam).
func NewDialer(knownHostsPath string, logger *slog.Logger) *Dialer {
	return &Dialer{knownHostsPath: knownHostsPath, logger: logger}
}

// hostKeyCallback membangun verifier known_hosts + TOFU untuk host baru.
// Host key mismatch (key BERBEDA dari known_hosts) tetap ditolak keras.
func (d *Dialer) hostKeyCallback() (ssh.HostKeyCallback, error) {
	if d.knownHostsPath == "" {
		d.logger.Warn("PAM_GATEWAY_KNOWN_HOSTS tidak diset — verifikasi host key ditolak keras (fail-safe)")
		return func(hostport string, _ net.Addr, key ssh.PublicKey) error {
			return fmt.Errorf("%w: verifier tidak dikonfigurasi (PAM_GATEWAY_KNOWN_HOSTS)",
				domain.ErrHostKeyUnknownFirstUse)
		}, nil
	}
	kh, err := knownhosts.New(d.knownHostsPath)
	if err != nil {
		return nil, fmt.Errorf("known_hosts tidak valid: %w", err)
	}
	return func(hostport string, remote net.Addr, key ssh.PublicKey) error {
		switch err := kh(hostport, remote, key); {
		case err == nil:
			return nil
		case isUnknownHost(err):
			// TOFU: simpan fingerprint pertama, teruskan koneksi.
			if terr := appendKnownHost(d.knownHostsPath, knownhosts.Normalize(remote.String()), key); terr != nil {
				return fmt.Errorf("TOFU menyimpan host key gagal: %w", terr)
			}
			d.logger.Info("host key target baru disimpan (TOFU)",
				"host", knownhosts.Normalize(remote.String()),
				"fingerprint", ssh.FingerprintSHA256(key))
			return nil
		default:
			// Key mismatch / host berubah → potensi MITM, tolak.
			return fmt.Errorf("host key tidak cocok known_hosts (potensi MITM): %w", err)
		}
	}, nil
}

// isUnknownHost membedakan "host belum ada di known_hosts" vs "key berubah".
func isUnknownHost(err error) bool {
	var kerr *knownhosts.KeyError
	if !errors.As(err, &kerr) {
		return false
	}
	return len(kerr.Want) == 0 // KeyError.Want kosong = host tidak dikenal
}

// appendKnownHost menulis baris known_hosts atomik (append + fsync).
func appendKnownHost(path, hostport string, key ssh.PublicKey) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	line := fmt.Sprintf("%s %s %s\n", hostport, key.Type(),
		base64.StdEncoding.EncodeToString(key.Marshal()))
	if _, err := f.WriteString(line); err != nil {
		return err
	}
	return f.Sync()
}

// Dial melakukan koneksi+auth SSH ke target (implementasi domain.SSHDialer).
// Secret account di-zero-ize segera setelah dipakai membangun auth method.
func (d *Dialer) Dial(ctx context.Context, target domain.TargetInfo, account domain.RedeemSecret) (domain.SSHClient, error) {
	if target.Port <= 0 || target.Port > 65535 {
		target.Port = 22
	}
	callback, err := d.hostKeyCallback()
	if err != nil {
		return nil, err
	}

	auth, err := authMethod(account)
	zeroBytes(account.Secret) // kredensial plaintext tidak boleh hidup lebih lama
	if err != nil {
		return nil, err
	}

	config := &ssh.ClientConfig{
		User:            account.Username,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: callback,
		Timeout:         dialTimeout,
		HostKeyAlgorithms: []string{
			// Moderne + fallback ed25519/rsa/ecdsa (urutan aman default).
			"ssh-ed25519-cert-v01@openssh.com",
			"ecdsa-sha2-nistp256-cert-v01@openssh.com",
			"rsa-sha2-512-cert-v01@openssh.com",
			"rsa-sha2-256-cert-v01@openssh.com",
			"ssh-ed25519",
			"ecdsa-sha2-nistp256",
			"rsa-sha2-512",
			"rsa-sha2-256",
		},
	}
	addr := net.JoinHostPort(target.Host, fmt.Sprintf("%d", target.Port))

	dialer := &net.Dialer{Timeout: dialTimeout}
	dctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	conn, err := dialer.DialContext(dctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("%w: dial %s: %v", domain.ErrUnreachable, addr, err)
	}
	cc, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("handshake SSH gagal ke %s: %w", addr, err)
	}
	client := &clientConn{conn: ssh.NewClient(cc, chans, reqs), logger: d.logger}

	// Keepalive loop — berhenti saat koneksi ditutup (conn lifetime).
	go func() {
		t := time.NewTicker(keepaliveInterval)
		defer t.Stop()
		for range t.C {
			if _, _, err := client.conn.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				client.logger.Debug("keepalive SSH gagal — koneksi mungkin mati", "err", err.Error())
			}
		}
	}()
	return client, nil
}

// authMethod membangun ssh.AuthMethod sesuai tipe akun vault.
// DATABASE / HTTP_ENDPOINT tidak dapat diproxy SSH → error domain.
func authMethod(account domain.RedeemSecret) (ssh.AuthMethod, error) {
	switch account.AccountType {
	case domain.AccountSSHPassword:
		if len(account.Secret) == 0 {
			return nil, fmt.Errorf("%w: secret password kosong", domain.ErrInvalidResponse)
		}
		// x/crypto membutuhkan string — salinan hidup selama handshake saja;
		// salinan Secret []byte di-zero-ize oleh pemanggil Dial.
		return ssh.Password(strings.Clone(string(account.Secret))), nil
	case domain.AccountSSHKey:
		signer, err := ssh.ParseRawPrivateKey(account.Secret)
		if err != nil {
			return nil, fmt.Errorf("private key vault tidak valid: %w", err)
		}
		signed, err := ssh.NewSignerFromKey(signer)
		if err != nil {
			return nil, fmt.Errorf("signer key gagal: %w", err)
		}
		return ssh.PublicKeys(signed), nil
	default:
		return nil, fmt.Errorf("%w: %s (hanya SSH_PASSWORD/SSH_KEY)",
			domain.ErrUnsupportedAccount, account.AccountType)
	}
}

// zeroBytes menimpa buffer kredensial dengan nol.
func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// clientConn implementasi domain.SSHClient.
type clientConn struct {
	conn   *ssh.Client
	logger *slog.Logger
}

func (c *clientConn) OpenPTY(rows, cols int, term string) (domain.ShellSession, error) {
	if term == "" {
		term = "xterm-256color"
	}
	if rows <= 0 {
		rows = 24
	}
	if cols <= 0 {
		cols = 80
	}
	sess, err := c.conn.NewSession()
	if err != nil {
		return nil, fmt.Errorf("%w: buka channel: %v", domain.ErrUnreachable, err)
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = sess.Close()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	if err := sess.RequestPty(term, rows, cols, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}); err != nil {
		_ = sess.Close()
		return nil, fmt.Errorf("pty-req ditolak target: %w", err)
	}
	if err := sess.Shell(); err != nil {
		_ = sess.Close()
		return nil, fmt.Errorf("shell ditolak target: %w", err)
	}

	s := &shellSession{sess: sess, stdin: stdin, out: make(chan []byte, 64)}
	// P stdout+stderr → channel (stderr dicampur — sesi interaktif).
	if stdoutR, err := sess.StdoutPipe(); err == nil {
		go s.pump(stdoutR)
	}
	if stderrR, err := sess.StderrPipe(); err == nil {
		go s.pump(stderrR)
	}
	// Wait → set exit code + tutup channel saat sesi berakhir.
	go func() {
		waitErr := sess.Wait()
		if waitErr != nil {
			if ex, ok := waitErr.(*ssh.ExitError); ok {
				s.mu.Lock()
				s.exit = ex.ExitStatus()
				s.mu.Unlock()
			}
		}
		s.closed.Do(func() { close(s.out) })
	}()
	return s, nil
}

func (c *clientConn) Close() error {
	return c.conn.Close()
}

// shellSession implementasi domain.ShellSession.
type shellSession struct {
	sess   *ssh.Session
	stdin  io.WriteCloser
	out    chan []byte
	mu     sync.Mutex
	exit   int
	closed sync.Once
}

func (s *shellSession) pump(r io.Reader) {
	buf := make([]byte, outChunkSize)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			s.out <- chunk
		}
		if err != nil {
			return
		}
	}
}

func (s *shellSession) StdinWrite(p []byte) error {
	_, err := s.stdin.Write(p)
	return err
}

func (s *shellSession) StdoutPipe() <-chan []byte { return s.out }

func (s *shellSession) Resize(rows, cols int) error {
	return s.sess.WindowChange(rows, cols)
}

func (s *shellSession) ExitCode() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exit
}

func (s *shellSession) Close() error {
	s.closed.Do(func() {
		_ = s.stdin.Close()
		_ = s.sess.Close()
	})
	return nil
}
