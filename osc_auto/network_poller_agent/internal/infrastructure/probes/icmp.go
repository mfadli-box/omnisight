// Probe ICMP — via binary ping sistem (argumen eksplisit, TANPA shell).
// Alasan: raw socket ICMP butuh CAP_NET_RAW (Linux root) / admin (Windows);
// binary ping adalah pola aman lintas-platform (setuid ping/capabilitas
// sudah dikelola OS). Implementasi per-OS: icmp_linux.go & icmp_windows.go.
package probes

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// pingTimeout batas total eksekusi binary ping.
const pingTimeout = 5 * time.Second

// probeICMP — eksekusi ping dan parse RTT.
func (p *Prober) probeICMP(ctx context.Context, m domain.MonitorConfig) (domain.ProbeResult, error) {
	host := m.Target
	if host == "" || containsMetachar(host) {
		return domain.ProbeResult{}, fmt.Errorf("%w: ICMP target tidak valid", domain.ErrInvalidTarget)
	}

	bin, args := pingCommand(host, pingTimeout)
	cmdCtx, cancel := context.WithTimeout(ctx, pingTimeout+2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cmdCtx, bin, args...) // argumen eksplisit — tanpa shell
	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return domain.ProbeResult{}, ctx.Err()
	}
	ms := parsePingRTT(string(out))
	if err != nil {
		msg := fmt.Sprintf("ping gagal (%s)", errTail(err))
		if ms != nil {
			return domain.ProbeResult{Status: domain.StatusDown, PingMS: ms, Msg: msg}, nil
		}
		return domain.ProbeResult{Status: domain.StatusDown, Msg: msg}, nil
	}
	// Beberapa ping tidak punya rtt ter-parse (mis. output non-Inggris) —
	// exit 0 dianggap UP, rtt null.
	return domain.ProbeResult{Status: domain.StatusUp, PingMS: ms, Msg: "ping ok"}, nil
}

// errTail — pesan error ringkas.
func errTail(err error) string {
	if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
		s := string(ee.Stderr)
		if len(s) > 120 {
			s = s[len(s)-120:]
		}
		return s
	}
	return err.Error()
}

// metachar regex — untuk validasi host anti-argument-injection.
var metacharRe = regexp.MustCompile(`[^\w.\-:\[\]]`)

func containsMetachar(host string) bool { return metacharRe.MatchString(host) }

// parsePingRTT — cari "time=12.3 ms" / "time<1 ms" / "Average = 3ms".
func parsePingRTT(out string) *int64 {
	// Linux/macOS: time=23.4 ms ; Windows: time=3ms / Minimum = 2ms, Maximum = 3ms, Average = 2ms
	re := regexp.MustCompile(`(?i)(?:time[=<]|Average\s*=\s*)(\d+(?:\.\d+)?)\s*ms`)
	if m := re.FindStringSubmatch(out); m != nil {
		if f, err := strconv.ParseFloat(m[1], 64); err == nil {
			v := int64(f + 0.5)
			return &v
		}
	}
	return nil
}
