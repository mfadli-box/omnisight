// Package usecase — Data Retention Cleanup: job terjadwal yang memicu
// POST /api/v1/agents/retention/purge pada osc_rest (HMAC agent + allowlist
// env RETENTION_PURGE_AGENT_IDS di server — deny-by-default).
//
// Kebijakan hari (30–90 hari metrik tier-1m, 90 tier-10m, 30 heartbeat,
// 365 SecOps) DIKELOLA & di-clamp server-side — agent hanya memicu sesuai
// jadwal dan melaporkan hasil (dry-run didukung server).
package usecase

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

// RetentionJob — scheduler purge harian.
type RetentionJob struct {
	api    domain.RetentionClient
	logger *slog.Logger
	every  time.Duration
	dryRun bool
	now    domain.Now
}

// NewRetentionJob membangun job. every < 1h → clamp ke 1h (anti spam purge);
// default 24h.
func NewRetentionJob(api domain.RetentionClient, every time.Duration,
	dryRun bool, logger *slog.Logger) *RetentionJob {
	if every < time.Hour {
		every = 24 * time.Hour
	}
	if every > 7*24*time.Hour {
		every = 24 * time.Hour
	}
	return &RetentionJob{api: api, logger: logger, every: every, dryRun: dryRun, now: time.Now}
}

// Every — interval eksekusi (untuk log wiring).
func (j *RetentionJob) Every() time.Duration { return j.every }

// DryRun — mode dry-run.
func (j *RetentionJob) DryRun() bool { return j.dryRun }

// Run menjalankan purge terjadwal sampai ctx dibatalkan. Eksekusi pertama
// setelah jeda 10 menit (beri masa hangat stack supaya agent HMAC valid dan
// osc_rest siap), lalu tiap `every`.
func (j *RetentionJob) Run(ctx context.Context) {
	timer := time.NewTimer(10 * time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			j.logger.Info("job retensi berhenti")
			return
		case <-timer.C:
			j.execute(ctx)
			timer.Reset(j.every)
		}
	}
}

// execute satu eksekusi purge (dipanggil Run; diekspor ke test via RunOnce).
func (j *RetentionJob) execute(ctx context.Context) {
	log := j.logger.With("job", "retention_purge", "dry_run", j.dryRun)
	purged, err := j.api.PurgeRetention(ctx, j.dryRun)
	if err != nil {
		// 403 = agent tidak terdaftar RETENTION_PURGE_AGENT_IDS (deny-by-default)
		// — log jelas, jangan retry spam; interval berikutnya tetap berjalan.
		if strings.Contains(err.Error(), domain.ErrRejected.Error()) {
			log.Warn("purge ditolak server (cek RETENTION_PURGE_AGENT_IDS di osc_rest)", "err", err.Error())
			return
		}
		log.Warn("purge gagal", "err", err.Error())
		return
	}
	total := int64(0)
	for _, v := range purged {
		total += v
	}
	log.Info("purge retensi selesai", "total_rows", total)
	for table, n := range purged {
		log.Info("detail purge", "table", table, "rows", n)
	}
}
