// Package usecase — orkestrasi siklus pengumpulan telemetri host: sampel
// metrik + container stats → ingest batch, dan inventaris pada interval
// lebih jarang. Bergantung hanya pada port domain.
package usecase

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
)

// maxContainersPerBatch — batas server kontrak (lebih ditolak 400).
const maxContainersPerBatch = 200

// maxFimEventsPerBatch — batas kontrak w3.openapi.yaml (fim_events ≤ 500).
const maxFimEventsPerBatch = 500

// Collector use case telemetri.
type Collector struct {
	sys            domain.SystemCollector
	docker         domain.DockerStatsCollector // nil = nonaktif
	fim            domain.FimCollector         // nil = FIM nonaktif
	api            domain.RustAPIClient
	logger         *slog.Logger
	inventoryEvery time.Duration
	fimEvery       time.Duration
	dockerEnabled  bool

	mu            sync.Mutex
	lastInventory time.Time
	hasInventory  bool
	lastFimScan   time.Time
	hasFimScan    bool
}

// NewCollector membangun use case. dockerEnabled=false → container stats
// tidak pernah dikumpulkan meskipun collector tersedia. fim nil → FIM
// dilewati; fimEvery clamp minimal 1 menit (anti polling berat).
func NewCollector(sys domain.SystemCollector, docker domain.DockerStatsCollector,
	dockerEnabled bool, inventoryEvery time.Duration, fim domain.FimCollector,
	fimEvery time.Duration, api domain.RustAPIClient, logger *slog.Logger) *Collector {
	if fimEvery < time.Minute {
		fimEvery = time.Minute
	}
	return &Collector{
		sys:            sys,
		docker:         docker,
		dockerEnabled:  dockerEnabled && docker != nil,
		fim:            fim,
		fimEvery:       fimEvery,
		api:            api,
		logger:         logger,
		inventoryEvery: inventoryEvery,
	}
}

// RunOnce mengeksekusi satu siklus: (1) ingest metrik host/container,
// (2) ingest inventaris bila jatuh tempo. Error dikumpulkan (kedua tahap
// tetap dijalankan) dan dikembalikan digabung.
func (c *Collector) RunOnce(ctx context.Context) error {
	var firstErr error

	// 1. Metrik host.
	sample, err := c.sys.CollectHostSample(ctx)
	if err != nil {
		c.logger.Error("pengumpulan metrik host gagal", "err", err.Error())
		firstErr = err
	}

	batch := domain.MetricsBatch{}
	if sample.RecordedAt != (time.Time{}) {
		batch.Host = &sample
	}

	// 2. Container stats (non-fatal per container; error kolektor → skip).
	if c.dockerEnabled {
		containers, err := c.docker.CollectContainers(ctx)
		if err != nil {
			c.logger.Warn("pengumpulan stats container gagal (batch tetap dikirim)",
				"err", err.Error())
		} else if len(containers) > 0 {
			if len(containers) > maxContainersPerBatch {
				containers = containers[:maxContainersPerBatch]
			}
			batch.Containers = containers
		}
	}

	if batch.Host != nil || len(batch.Containers) > 0 {
		if err := c.api.IngestMetrics(ctx, batch); err != nil {
			c.logger.Error("ingest metrics gagal", "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		} else {
			c.logger.Debug("metrics terkirim",
				"has_host", batch.Host != nil, "containers", len(batch.Containers))
		}
	}

	// 3. FIM scan (interval HOST_TELEMETRY_FIM_INTERVAL; scan pertama
	// langsung membangun baseline → semua entri dilaporkan CREATED).
	if c.fim != nil && c.fimDue() {
		events, err := c.fim.CollectChanges(ctx)
		if err != nil {
			c.logger.Error("scan FIM gagal", "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		} else {
			c.markFimScanned()
			if len(events) > 0 {
				// Validasi + truncate ke batas kontrak sebelum ingest.
				valid := make([]domain.FimEvent, 0, len(events))
				for _, evt := range events {
					if err := evt.Validate(); err != nil {
						c.logger.Warn("event FIM dibuang (validasi kontrak)",
							"path", evt.Path, "err", err.Error())
						continue
					}
					valid = append(valid, evt)
					if len(valid) >= maxFimEventsPerBatch {
						break
					}
				}
				if len(valid) > 0 {
					if err := c.api.IngestSecurity(ctx, domain.SecurityBatch{FimEvents: valid}); err != nil {
						c.logger.Error("ingest FIM gagal", "err", err.Error())
						if firstErr == nil {
							firstErr = err
						}
					} else {
						c.logger.Info("FIM terkirim", "events", len(valid))
					}
				}
			}
		}
	}

	// 4. Inventaris (interval panjang; sampel pertama langsung).
	if c.inventoryDue() {
		inv, err := c.sys.CollectInventory(ctx)
		if err != nil {
			c.logger.Error("pengumpulan inventaris gagal", "err", err.Error())
			if firstErr == nil {
				firstErr = err
			}
		} else if !inv.IsZero() {
			if err := c.api.IngestInventory(ctx, inv); err != nil {
				c.logger.Error("ingest inventory gagal", "err", err.Error())
				if firstErr == nil {
					firstErr = err
				}
			} else {
				c.markInventorySent()
				c.logger.Info("inventory terkirim", "hostname", inv.Hostname)
			}
		}
	}

	return firstErr
}

// inventoryDue — inventaris dikirim pada siklus pertama lalu tiap
// inventoryEvery.
func (c *Collector) inventoryDue() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.hasInventory || time.Since(c.lastInventory) >= c.inventoryEvery
}

func (c *Collector) markInventorySent() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastInventory = time.Now()
	c.hasInventory = true
}

// fimDue — scan FIM dijalankan pada siklus pertama lalu tiap fimEvery.
func (c *Collector) fimDue() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.hasFimScan || time.Since(c.lastFimScan) >= c.fimEvery
}

func (c *Collector) markFimScanned() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastFimScan = time.Now()
	c.hasFimScan = true
}
