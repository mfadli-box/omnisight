// CommandRunner — eksekusi proses dengan argumen EKSPLISIT (tanpa shell),
// output bounded, context/timeout diselamatkan. Ini satu-satunya titik
// exec di agent (surface command-injection minimal).
package execrunner

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

// Runner implementasi domain.CommandRunner.
type Runner struct{}

// New membangun runner.
func New() *Runner { return &Runner{} }

// Run menjalankan name+args di dir (dir kosong = cwd proses agent).
func (r *Runner) Run(ctx context.Context, name string, args []string, dir string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = time.Minute
	}
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, name, args...) // tanpa shell — argumen eksplisit
	if dir != "" {
		cmd.Dir = dir
	}
	// Lingkungan minimal: PATH diperlukan tool (docker/nginx); env host
	// tidak diteruskan mentah-mentah (menghindari kebocoran variabel sensitif).
	cmd.Env = []string{"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL=C"}

	var buf bytes.Buffer
	// Output dibatasi — anti memory-bomb (LimitReader pada pipe).
	cmd.Stdout = &limitedWriter{w: &buf, n: 64 << 10}
	cmd.Stderr = &limitedWriter{w: &buf, n: 64 << 10}

	if err := cmd.Start(); err != nil {
		return buf.String(), fmt.Errorf("start %s: %w", name, err)
	}
	if err := cmd.Wait(); err != nil {
		if cmdCtx.Err() != nil {
			return buf.String(), fmt.Errorf("%s timeout/dibatalkan: %w", name, cmdCtx.Err())
		}
		if ee, ok := err.(*exec.ExitError); ok {
			return buf.String(), fmt.Errorf("exit status %d", ee.ExitCode())
		}
		return buf.String(), err
	}
	return buf.String(), nil
}

// limitedWriter menulis maksimal n byte (setelah itu membuang sisanya).
type limitedWriter struct {
	w *bytes.Buffer
	n int
}

func (l *limitedWriter) Write(p []byte) (int, error) {
	if l.n <= 0 {
		return len(p), nil // buang — tetap laporkan jumlah penuh
	}
	if len(p) > l.n {
		l.w.Write(p[:l.n])
		l.n = 0
		return len(p), nil
	}
	l.w.Write(p)
	l.n -= len(p)
	return len(p), nil
}
