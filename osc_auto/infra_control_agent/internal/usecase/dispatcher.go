// Package usecase — dispatcher infra: tarik dispatch dari outbox osc_rest,
// eksekusi (docker compose / nginx) dengan validasi ketat, ack hasil, dan
// push log live. Bergantung hanya pada port domain.
package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/domain"
)

const (
	// composeFileName — nama file stack yang dikelola agent.
	composeFileName = "compose.yaml"
	// envFileName — env override stack (mode 0600; plaintext kontrak server).
	envFileName = ".env"
	// maxOutputBytes membatasi capture output proses (anti memory-bomb).
	maxOutputBytes = 64 << 10
	// execTimeout batas total satu eksekusi command.
	execTimeout = 10 * time.Minute
	// maxLogLines / maxLogLineLen — batas kontrak /agents/logs.
	maxLogLines   = 100
	maxLogLineLen = 2000
)

// Dispatcher orkestrasi eksekusi dispatch.
type Dispatcher struct {
	source    domain.DispatchSource
	acker     domain.AckSink
	logs      domain.LogPublisher
	runner    domain.CommandRunner
	fs        domain.FileSystem
	stacksDir string
	nginxDir  string // direktori file konfigurasi vhost (conf.d/omnisight)
	dockerBin string
	nginxBin  string
	logger    *slog.Logger

	mu       sync.Mutex
	accepted map[string]bool // idempotensi dispatch_ref dalam sesi
}

// NewDispatcher membangun dispatcher.
func NewDispatcher(source domain.DispatchSource, acker domain.AckSink, logs domain.LogPublisher,
	runner domain.CommandRunner, fs domain.FileSystem,
	stacksDir, nginxDir, dockerBin, nginxBin string, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{
		source: source, acker: acker, logs: logs, runner: runner, fs: fs,
		stacksDir: stacksDir, nginxDir: nginxDir,
		dockerBin: dockerBin, nginxBin: nginxBin,
		logger: logger, accepted: make(map[string]bool),
	}
}

// RunOnce menarik & mengeksekusi semua dispatch pending secara berurutan
// (serialized — operasi infrastruktur tidak boleh paralel satu mesin).
func (d *Dispatcher) RunOnce(ctx context.Context) error {
	pending, err := d.source.FetchPending(ctx)
	if err != nil {
		if isNotFound(err) {
			d.logger.Debug("tidak ada dispatch pending")
			return nil
		}
		d.logger.Error("fetch dispatch gagal", "err", err.Error())
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	var firstErr error
	for _, disp := range pending {
		if !d.claimOnce(disp.DispatchRef) {
			d.logger.Warn("dispatch_ref duplikat dalam sesi — dilewati", "dispatch_ref", disp.DispatchRef)
			continue
		}
		if err := d.execute(ctx, disp); err != nil {
			d.logger.Error("eksekusi dispatch gagal", "dispatch_ref", disp.DispatchRef, "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

// claimOnce — idempotensi sederhana per sesi (dedup ref).
func (d *Dispatcher) claimOnce(ref string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.accepted[ref] {
		return false
	}
	d.accepted[ref] = true
	return true
}

// execute menjalankan satu dispatch dan selalu ack hasil (APPLIED/FAILED).
func (d *Dispatcher) execute(ctx context.Context, disp domain.Dispatch) error {
	d.logger.Info("dispatch mulai", "dispatch_ref", disp.DispatchRef,
		"kind", disp.Kind, "command", disp.Command)

	var status, lastErr string
	switch {
	case disp.Kind == domain.DispatchKindDockerStack && disp.Stack != nil:
		status, lastErr = d.executeStack(ctx, disp)
	case disp.Kind == domain.DispatchKindNginxVhost && disp.Vhost != nil:
		status, lastErr = d.executeVhost(ctx, disp)
	default:
		status, lastErr = domain.StatusFailed,
			fmt.Sprintf("dispatch tidak valid: kind=%q (payload hilang)", disp.Kind)
	}

	ack := domain.AckResult{DispatchRef: disp.DispatchRef, Status: status, At: time.Now().UTC()}
	if lastErr != "" {
		ack.LastError = truncateStr(lastErr, 2000)
	}
	if err := d.acker.Ack(ctx, ack); err != nil {
		d.logger.Error("ack gagal", "dispatch_ref", disp.DispatchRef, "err", err.Error())
		return err
	}
	d.logger.Info("dispatch selesai", "dispatch_ref", disp.DispatchRef, "status", status)
	return nil
}

// executeStack — docker compose: tulis compose.yaml + .env (validasi ketat),
// jalankan command enum, publikasikan log.
func (d *Dispatcher) executeStack(ctx context.Context, disp domain.Dispatch) (string, string) {
	stack := disp.Stack

	dir, err := ValidateInsideRoot(d.fs, d.stacksDir, stack.WorkingDir)
	if err != nil {
		return domain.StatusFailed, fmt.Sprintf("working_dir ditolak: %v", err)
	}

	// Validasi konten compose (gerbang kedua; parse penuh tetap docker compose).
	if disp.Command == domain.CmdUp || disp.Command == domain.CmdRestart {
		if err := ValidateComposeContent(stack.ComposeContent); err != nil {
			return domain.StatusFailed, fmt.Sprintf("compose_content ditolak: %v", err)
		}
	}
	if !commandAllowedStack(disp.Command) {
		return domain.StatusFailed, fmt.Sprintf("command tidak diizinkan: %q", disp.Command)
	}

	// Tulis file hanya untuk command yang memodifikasi stack.
	if disp.Command == domain.CmdUp || disp.Command == domain.CmdRestart {
		if err := d.fs.MkdirAll(dir, 0o700); err != nil {
			return domain.StatusFailed, fmt.Sprintf("mkdir stack dir: %v", err)
		}
		composePath := filepath.Join(dir, composeFileName)
		if err := d.fs.WriteFileAtomic(composePath, []byte(stack.ComposeContent), 0o600); err != nil {
			return domain.StatusFailed, fmt.Sprintf("tulis compose.yaml: %v", err)
		}
		if stack.Env != "" {
			if err := d.fs.WriteFileAtomic(filepath.Join(dir, envFileName), []byte(stack.Env), 0o600); err != nil {
				return domain.StatusFailed, fmt.Sprintf("tulis .env: %v", err)
			}
		}
	}

	// Args eksplisit (allowlist) — TANPA shell.
	var args []string
	switch disp.Command {
	case domain.CmdUp:
		args = []string{"compose", "-f", composeFileName, "up", "-d"}
	case domain.CmdRestart:
		args = []string{"compose", "-f", composeFileName, "restart"}
	case domain.CmdDown:
		args = []string{"compose", "-f", composeFileName, "down"}
	case domain.CmdPull:
		args = []string{"compose", "-f", composeFileName, "pull"}
	}

	out, err := d.runner.Run(ctx, d.dockerBin, args, dir, execTimeout)
	d.publishLogs(ctx, domain.DispatchKindDockerStack, stack.ID, out, err)
	if err != nil {
		return domain.StatusFailed, fmt.Sprintf("docker compose %s gagal: %v", disp.Command, summarize(out, err))
	}
	return domain.StatusApplied, ""
}

// executeVhost — nginx: tulis konfigurasi kandidat, `nginx -t`, reload bila
// lolos; rollback otomatis ke konten lama bila test/reload gagal.
func (d *Dispatcher) executeVhost(ctx context.Context, disp domain.Dispatch) (string, string) {
	vh := disp.Vhost

	if disp.Command != domain.CmdTestReload {
		return domain.StatusFailed, fmt.Sprintf("command tidak diizinkan: %q", disp.Command)
	}
	if err := ValidateNginxConfig(vh.ConfigContent); err != nil {
		return domain.StatusFailed, fmt.Sprintf("config_content ditolak: %v", err)
	}

	if _, err := ValidateInsideRoot(d.fs, d.nginxDir, d.nginxDir); err != nil {
		return domain.StatusFailed, fmt.Sprintf("nginx config dir ditolak: %v", err)
	}
	confPath := filepath.Join(d.nginxDir, vh.ID+".conf")
	if _, err := ValidateInsideRoot(d.fs, d.nginxDir, confPath); err != nil {
		return domain.StatusFailed, fmt.Sprintf("path konfigurasi vhost ditolak: %v", err)
	}

	// Simpan konten lama untuk rollback.
	oldContent, hasOld := []byte(nil), false
	if d.fs.Exists(confPath) {
		old, err := d.fs.ReadFile(confPath)
		if err != nil {
			return domain.StatusFailed, fmt.Sprintf("baca config lama: %v", err)
		}
		oldContent, hasOld = old, true
	}

	// Tulis konfigurasi baru (kandidat).
	if err := d.fs.MkdirAll(d.nginxDir, 0o700); err != nil {
		return domain.StatusFailed, fmt.Sprintf("mkdir nginx dir: %v", err)
	}
	if err := d.fs.WriteFileAtomic(confPath, []byte(vh.ConfigContent), 0o600); err != nil {
		return domain.StatusFailed, fmt.Sprintf("tulis config vhost: %v", err)
	}

	rollback := func(reason error) (string, string) {
		if hasOld {
			if err := d.fs.WriteFileAtomic(confPath, oldContent, 0o600); err != nil {
				return domain.StatusFailed,
					fmt.Sprintf("rollback gagal (config manual review!): %v; penyebab: %v", err, reason)
			}
			// Validasi ulang rollback — konfigurasi lama harus tetap lolos -t.
			if _, err := d.runner.Run(ctx, d.nginxBin, []string{"-t"}, d.nginxDir, 30*time.Second); err != nil {
				return domain.StatusFailed,
					fmt.Sprintf("rollback gagal validasi: %v; penyebab awal: %v", err, reason)
			}
		} else {
			// Tidak ada config lama → hapus kandidat (balik ke kondisi awal).
			_ = d.fs.RemoveFile(confPath)
		}
		return domain.StatusRolledBack, fmt.Sprintf("nginx test/reload gagal, rollback diterapkan: %v", reason)
	}

	// 1) nginx -t (wajib sebelum reload — pola validasi Nginx UI).
	outTest, errTest := d.runner.Run(ctx, d.nginxBin, []string{"-t"}, d.nginxDir, 30*time.Second)
	d.publishLogs(ctx, domain.DispatchKindNginxVhost, vh.ID, outTest, errTest)
	if errTest != nil {
		return rollback(fmt.Errorf("nginx -t: %v: %s", errTest, summarize(outTest, nil)))
	}

	// 2) reload.
	outRel, errRel := d.runner.Run(ctx, d.nginxBin, []string{"-s", "reload"}, d.nginxDir, 30*time.Second)
	d.publishLogs(ctx, domain.DispatchKindNginxVhost, vh.ID, outRel, errRel)
	if errRel != nil {
		return rollback(fmt.Errorf("nginx -s reload: %v: %s", errRel, summarize(outRel, nil)))
	}

	return domain.StatusApplied, ""
}

// publishLogs mempublikasikan output eksekusi ke SSE osc_rest (bounded).
func (d *Dispatcher) publishLogs(ctx context.Context, scope, reference, out string, execErr error) {
	lines := splitLines(out)
	if execErr != nil {
		lines = append(lines, "ERROR: "+execErr.Error())
	}
	if len(lines) == 0 {
		return
	}
	if len(lines) > maxLogLines {
		lines = lines[len(lines)-maxLogLines:] // simpan tail
	}
	for i := range lines {
		lines[i] = truncateStr(lines[i], maxLogLineLen)
	}
	level := "INFO"
	if execErr != nil {
		level = "ERROR"
	}
	if err := d.logs.Publish(ctx, domain.LogPublish{
		Scope: scope, Reference: reference, Source: "agent", Level: level, Lines: lines,
	}); err != nil {
		d.logger.Warn("publish log gagal (eksekusi tetap dilanjutkan)", "err", err.Error())
	}
}

// commandAllowedStack — allowlist command stack (defense-in-depth).
func commandAllowedStack(cmd string) bool {
	switch cmd {
	case domain.CmdUp, domain.CmdDown, domain.CmdPull, domain.CmdRestart:
		return true
	}
	return false
}

// summarize — ringkas output + error untuk last_error.
func summarize(out string, err error) string {
	msg := strings.TrimSpace(out)
	if len(msg) > 500 {
		msg = msg[len(msg)-500:] // tail output paling relevan
	}
	if err != nil {
		if msg != "" {
			msg += "; "
		}
		msg += err.Error()
	}
	return truncateStr(msg, 1000)
}

func splitLines(s string) []string {
	raw := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := raw[:0]
	for _, l := range raw {
		l = strings.TrimRight(l, " \t")
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func truncateStr(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func isNotFound(err error) bool { return errors.Is(err, domain.ErrNotFound) }
