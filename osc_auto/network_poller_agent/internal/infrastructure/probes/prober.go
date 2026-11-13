// Package probes — implementasi port domain.Prober untuk semua tipe probe:
// HTTP/HTTPS/KEYWORD (SSL cert expiry), TCP, ICMP (binary ping), DNS.
package probes

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

const (
	// defaultProbeTimeout batas total satu probe (kecuali dioverride per monitor).
	defaultProbeTimeout = 10 * time.Second
	// maxBodyBytes membatasi pembacaan body probe HTTP (anti memory-bomb).
	maxBodyBytes = 64 << 10 // 64 KiB
	// certExpiryWarnDays ambang disorot pada pesan.
	certExpiryWarnDays = 30
)

// tlsConf — TLS 1.2+ wajib untuk semua probe HTTPS (tanpa skip verify).
func tlsConf() *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS12}
}

// Prober implementasi domain.Prober.
type Prober struct {
	client   *http.Client
	resolver *net.Resolver
}

// New membangun prober. httpTimeout ≤ 0 → default 10s.
func New(httpTimeout time.Duration) *Prober {
	if httpTimeout <= 0 {
		httpTimeout = defaultProbeTimeout
	}
	transport := &http.Transport{
		// Probe outbound: matikan proxy lingkungan agar hasil deterministik.
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 0,
		}).DialContext,
		TLSClientConfig:       tlsConf(),
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: httpTimeout,
		// Redirect diikuti apa adanya (status akhir yang dinilai).
		MaxIdleConns:      4,
		IdleConnTimeout:   30 * time.Second,
		DisableKeepAlives: true, // probe one-shot: jangan tahan koneksi
	}
	return &Prober{
		client:   &http.Client{Transport: transport, Timeout: httpTimeout},
		resolver: net.DefaultResolver,
	}
}

// Probe mengeksekusi satu probe sesuai tipe monitor.
func (p *Prober) Probe(ctx context.Context, m domain.MonitorConfig) domain.ProbeResult {
	var r domain.ProbeResult
	var err error
	switch strings.ToUpper(m.Type) {
	case domain.MonitorHTTP, domain.MonitorHTTPS, domain.MonitorKeyword:
		r, err = p.probeHTTP(ctx, m)
	case domain.MonitorTCP:
		r, err = p.probeTCP(ctx, m)
	case domain.MonitorICMP:
		r, err = p.probeICMP(ctx, m)
	case domain.MonitorDNS:
		r, err = p.probeDNS(ctx, m)
	default:
		return domain.ProbeResult{Status: domain.StatusDown, Msg: fmt.Sprintf("tipe monitor tidak didukung: %s", m.Type)}
	}
	if err != nil {
		return domain.ProbeResult{Status: domain.StatusDown, Msg: truncate(err.Error(), 500)}
	}
	return r
}

// truncate membatasi pesan (kontrak msg ≤ 500).
func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// probeHTTP — HTTP/HTTPS/KEYWORD + info kedaluwarsa sertifikat TLS.
func (p *Prober) probeHTTP(ctx context.Context, m domain.MonitorConfig) (domain.ProbeResult, error) {
	target := m.Target
	if !strings.Contains(target, "://") {
		// Tanpa scheme: HTTP → http, HTTPS/KEYWORD → https.
		if strings.EqualFold(m.Type, domain.MonitorHTTP) {
			target = "http://" + target
		} else {
			target = "https://" + target
		}
	}
	u, err := url.Parse(target)
	if err != nil {
		return domain.ProbeResult{}, fmt.Errorf("URL tidak valid: %v", err)
	}
	// Anti-SSRF ringan (selaras validasi osc_rest): tanpa userinfo.
	if u.User != nil {
		return domain.ProbeResult{}, domain.ErrInvalidTarget
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return domain.ProbeResult{}, fmt.Errorf("%w: scheme %q", domain.ErrInvalidTarget, u.Scheme)
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return domain.ProbeResult{}, err
	}
	req.Header.Set("User-Agent", "omnisight-network-poller-agent/0.1.0")

	resp, err := p.client.Do(req)
	if err != nil {
		return domain.ProbeResult{}, fmt.Errorf("request gagal: %v", err)
	}
	defer resp.Body.Close()

	// Baca body terbatas (untuk KEYWORD; juga mencegah koneksi menggantung).
	body, _ := readAllLimited(resp.Body, maxBodyBytes)
	ms := int64(time.Since(start) / time.Millisecond)

	msg := fmt.Sprintf("HTTP %d", resp.StatusCode)
	okStatus := resp.StatusCode >= 200 && resp.StatusCode < 400

	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		msg += "; " + certExpiryNote(resp.TLS.PeerCertificates[0].NotAfter)
	}

	if strings.EqualFold(m.Type, domain.MonitorKeyword) {
		if m.Keyword == "" {
			return domain.ProbeResult{}, fmt.Errorf("%w: KEYWORD tanpa config.keyword", domain.ErrInvalidTarget)
		}
		if !strings.Contains(string(body), m.Keyword) {
			return domain.ProbeResult{Status: domain.StatusDown, PingMS: &ms,
				Msg: truncate(fmt.Sprintf("%s; keyword %q tidak ditemukan", msg, m.Keyword), 500)}, nil
		}
		msg = fmt.Sprintf("HTTP %d; keyword %q ditemukan", resp.StatusCode, m.Keyword)
	} else if !okStatus {
		return domain.ProbeResult{Status: domain.StatusDown, PingMS: &ms, Msg: truncate(msg, 500)}, nil
	}
	return domain.ProbeResult{Status: domain.StatusUp, PingMS: &ms, Msg: truncate(msg, 500)}, nil
}

// readAllLimited membaca maksimal n byte.
func readAllLimited(r interface{ Read([]byte) (int, error) }, n int) ([]byte, error) {
	buf := make([]byte, 0, n)
	tmp := make([]byte, 4096)
	for len(buf) < n {
		maxRead := n - len(buf)
		if maxRead > len(tmp) {
			maxRead = len(tmp)
		}
		k, err := r.Read(tmp[:maxRead])
		buf = append(buf, tmp[:k]...)
		if err != nil {
			return buf, nil // EOF / error → kembalikan apa yang terbaca
		}
	}
	return buf, nil
}

// certExpiryNote — catatan masa berlaku sertifikat dalam pesan probe.
func certExpiryNote(notAfter time.Time) string {
	days := int64(time.Until(notAfter).Hours() / 24)
	if days < 0 {
		return fmt.Sprintf("SSL EXPIRED %s", notAfter.UTC().Format("2006-01-02"))
	}
	note := fmt.Sprintf("SSL %dd (%s)", days, notAfter.UTC().Format("2006-01-02"))
	if days < certExpiryWarnDays {
		note = "SSL AKAN BERAKHIR " + note
	}
	return note
}

// probeTCP — sambungkan host:port, ukur waktu koneksi.
func (p *Prober) probeTCP(ctx context.Context, m domain.MonitorConfig) (domain.ProbeResult, error) {
	host, port, err := net.SplitHostPort(m.Target)
	if err != nil {
		return domain.ProbeResult{}, fmt.Errorf("%w: TCP target harus host:port", domain.ErrInvalidTarget)
	}
	if net.ParseIP(host) == nil {
		if strings.ContainsAny(host, ":@") || host == "" {
			return domain.ProbeResult{}, fmt.Errorf("%w: host TCP tidak valid", domain.ErrInvalidTarget)
		}
	}
	start := time.Now()
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
	if err != nil {
		return domain.ProbeResult{Status: domain.StatusDown,
			Msg: truncate(fmt.Sprintf("connect gagal: %v", err), 500)}, nil
	}
	ms := int64(time.Since(start) / time.Millisecond)
	_ = conn.Close()
	if _, err := strconv.Atoi(port); err != nil {
		return domain.ProbeResult{}, fmt.Errorf("%w: port tidak numerik", domain.ErrInvalidTarget)
	}
	return domain.ProbeResult{Status: domain.StatusUp, PingMS: &ms,
		Msg: truncate(fmt.Sprintf("TCP %s:%s terbuka", host, port), 500)}, nil
}

// probeDNS — resolve hostname; UP bila ≥ 1 alamat.
func (p *Prober) probeDNS(ctx context.Context, m domain.MonitorConfig) (domain.ProbeResult, error) {
	host := strings.TrimSpace(m.Target)
	if host == "" || strings.ContainsAny(host, " \t@:/") {
		return domain.ProbeResult{}, fmt.Errorf("%w: DNS target harus hostname polos", domain.ErrInvalidTarget)
	}
	if !isLikelyHostname(host) {
		return domain.ProbeResult{}, fmt.Errorf("%w: hostname tidak valid", domain.ErrInvalidTarget)
	}
	start := time.Now()
	lookupCtx, cancel := context.WithTimeout(ctx, defaultProbeTimeout)
	defer cancel()
	addrs, err := p.resolver.LookupHost(lookupCtx, host)
	ms := int64(time.Since(start) / time.Millisecond)
	if err != nil || len(addrs) == 0 {
		msg := fmt.Sprintf("resolve gagal: %v", err)
		return domain.ProbeResult{Status: domain.StatusDown, PingMS: &ms, Msg: truncate(msg, 500)}, nil
	}
	return domain.ProbeResult{Status: domain.StatusUp, PingMS: &ms,
		Msg: truncate(fmt.Sprintf("resolve %d alamat", len(addrs)), 500)}, nil
}

// isLikelyHostname — karakter hostname legal (alphanumeric, dash, dot).
var hostnameRe = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$`)

func isLikelyHostname(h string) bool { return len(h) <= 253 && hostnameRe.MatchString(h) }
