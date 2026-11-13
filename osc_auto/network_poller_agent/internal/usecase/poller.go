// Package usecase — orkestrasi siklus polling uptime & SNMP: load daftar
// monitor (hot-reload), probe tiap monitor, kirim heartbeat; poll counter
// SNMP, hitung rate, kirim batch. Bergantung hanya pada port domain.
package usecase

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// maxSnmpInterfacesPerBatch — batas server kontrak (lebih ditolak 400).
const maxSnmpInterfacesPerBatch = 500

// Poller use case utama network_poller_agent.
type Poller struct {
	source       domain.ConfigSource
	prober       domain.Prober
	snmp         domain.SNMPClient
	api          domain.RustAPIClient
	logger       *slog.Logger
	probeTimeout time.Duration

	mu   sync.Mutex
	prev map[string]snmpPrev // interface_id → counter sebelumnya
}

// snmpPrev — snapshot counter untuk perhitungan rate Bps.
type snmpPrev struct {
	in, out uint64
	at      time.Time
	ok      bool
}

// NewPoller membangun use case.
func NewPoller(source domain.ConfigSource, prober domain.Prober, snmp domain.SNMPClient,
	api domain.RustAPIClient, probeTimeout time.Duration, logger *slog.Logger) *Poller {
	return &Poller{
		source: source, prober: prober, snmp: snmp, api: api,
		logger: logger, probeTimeout: probeTimeout,
		prev: make(map[string]snmpPrev),
	}
}

// RunOnce mengeksekusi satu siklus polling. Error dikumpulkan; heartbeat
// yang gagal kirim tidak menghentikan monitor lain.
func (p *Poller) RunOnce(ctx context.Context) error {
	mf, err := p.source.Load(ctx)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			p.logger.Debug("monitors file belum ada — siklus dilewati", "err", err.Error())
			return nil
		}
		p.logger.Error("monitors file gagal dibaca", "err", err.Error())
		return err
	}

	var firstErr error
	// 1. Probe monitor sintetik → heartbeat.
	for _, m := range mf.Monitors {
		res := p.probeMonitor(ctx, m)
		hb := domain.HeartbeatPayload{
			MonitorID:  m.MonitorID,
			Status:     res.Status,
			PingMS:     res.PingMS,
			RecordedAt: time.Now().UTC(),
		}
		if res.Msg != "" {
			msg := res.Msg
			hb.Msg = &msg
		}
		if err := p.api.IngestHeartbeat(ctx, hb); err != nil {
			p.logger.Error("heartbeat gagal", "monitor_id", m.MonitorID, "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		} else {
			p.logger.Debug("heartbeat terkirim",
				"monitor_id", m.MonitorID, "status", res.Status, "ping_ms", res.PingMS)
		}
	}

	// 2. Poll counter SNMP → batch metrics.
	samples := p.collectSnmp(ctx, mf)
	if len(samples) > 0 {
		if len(samples) > maxSnmpInterfacesPerBatch {
			samples = samples[:maxSnmpInterfacesPerBatch]
		}
		if err := p.api.IngestMetrics(ctx, domain.MetricsBatch{SnmpInterfaces: samples}); err != nil {
			p.logger.Error("ingest metrics SNMP gagal", "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		} else {
			p.logger.Debug("metrics SNMP terkirim", "interfaces", len(samples))
		}
	}
	return firstErr
}

// probeMonitor membungkus prober dengan timeout per probe.
func (p *Poller) probeMonitor(ctx context.Context, m domain.MonitorConfig) domain.ProbeResult {
	timeout := p.probeTimeout
	if m.TimeoutSeconds > 0 {
		timeout = time.Duration(m.TimeoutSeconds) * time.Second
	}
	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return p.prober.Probe(probeCtx, m)
}

// collectSnmp mengambil counter semua device & membangun sampel rate.
func (p *Poller) collectSnmp(ctx context.Context, mf domain.MonitorsFile) []domain.SnmpInterfaceSample {
	if p.snmp == nil || len(mf.SnmpDevices) == 0 {
		return nil
	}
	now := time.Now().UTC()
	var samples []domain.SnmpInterfaceSample
	for _, dev := range mf.SnmpDevices {
		counters, err := p.snmp.FetchCounters(ctx, dev)
		if err != nil {
			p.logger.Warn("poll SNMP gagal (device dilewati)", "host", dev.Host, "err", err.Error())
			continue
		}
		for _, itf := range dev.Interfaces {
			c, ok := counters[itf.IfIndex]
			if !ok || c.InOctets == nil || c.OutOctets == nil {
				continue
			}
			s := domain.SnmpInterfaceSample{
				InterfaceID: itf.InterfaceID,
				CollectedAt: now,
				InOctets:    *c.InOctets,
				OutOctets:   *c.OutOctets,
			}
			if c.InErrors != nil {
				s.InErrors = int64Ptr(int64(*c.InErrors))
			}
			if c.OutErrors != nil {
				s.OutErrors = int64Ptr(int64(*c.OutErrors))
			}
			if c.InDiscards != nil {
				s.InDiscards = int64Ptr(int64(*c.InDiscards))
			}
			if c.OutDiscards != nil {
				s.OutDiscards = int64Ptr(int64(*c.OutDiscards))
			}

			p.mu.Lock()
			prev, hasPrev := p.prev[itf.InterfaceID]
			p.prev[itf.InterfaceID] = snmpPrev{in: *c.InOctets, out: *c.OutOctets, at: now, ok: true}
			p.mu.Unlock()

			if hasPrev {
				elapsed := now.Sub(prev.at).Seconds()
				if elapsed > 0 {
					inRate := ratePerSec(*c.InOctets, prev.in, elapsed)
					outRate := ratePerSec(*c.OutOctets, prev.out, elapsed)
					s.InRateBPS = &inRate
					s.OutRateBPS = &outRate
				}
			}
			samples = append(samples, s)
		}
	}
	return samples
}

// ratePerSec — delta counter clamp ≥ 0 dibagi elapsed.
func ratePerSec(cur, prev uint64, elapsed float64) int64 {
	if cur < prev {
		return 0 // counter reset (device reboot)
	}
	return int64(float64(cur-prev) / elapsed)
}

func int64Ptr(v int64) *int64 { return &v }
