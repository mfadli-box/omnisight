package backbone

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const retentionBatch = 10000

type retentionRule struct {
	table string
	col   string
	days  int
	extra string
}

func retentionRules() []retentionRule {
	telemetryDays := envInt("RE_DAYS", 30)
	logsDays := envInt("RE_LOGS", 90)
	reportDays := envInt("RE_REPORT", 365)

	// Telemetri: metrik/statistik bervolume tinggi (default RE_DAYS).
	telemetry := []retentionRule{
		{table: "bot_heartbeat", col: "created_at", days: telemetryDays},
		{table: "obs_metric", col: "recorded_at", days: telemetryDays},
		{table: "obs_disk", col: "recorded_at", days: telemetryDays},
		{table: "obs_container_stat", col: "recorded_at", days: telemetryDays},
		{table: "obs_vm_stat", col: "recorded_at", days: telemetryDays},
		{table: "obs_check_result", col: "created_at", days: telemetryDays},
		{table: "net_interface_stat", col: "recorded_at", days: telemetryDays},
		{table: "net_ping_result", col: "recorded_at", days: telemetryDays},
		{table: "pod_disk_usage", col: "recorded_at", days: telemetryDays},
		{table: "pod_port_binding", col: "created_at", days: telemetryDays},
		{table: "pod_update_check", col: "checked_at", days: telemetryDays},
		{table: "pam_health_check", col: "last_check_at", days: telemetryDays},
		{table: "web_server_metric", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_hardware", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_os", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_package", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_iface", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_port", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_process", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_user", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_group", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_service", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_hotfix", col: "recorded_at", days: telemetryDays},
		{table: "sec_syscollector_browser_ext", col: "recorded_at", days: telemetryDays},
	}

	// Log/event/audit: append-only (default RE_LOGS).
	logs := []retentionRule{
		{table: "obs_log", col: "recorded_at", days: logsDays},
		{table: "jms_run", col: "started_at", days: logsDays},
		{table: "sec_waf_event", col: "occurred_at", days: logsDays},
		{table: "sec_event", col: "created_at", days: logsDays},
		{table: "sec_event_alert", col: "created_at", days: logsDays},
		{table: "sec_fim_event", col: "occurred_at", days: logsDays},
		{table: "sec_sca_result", col: "recorded_at", days: logsDays},
		{table: "sec_vuln", col: "detected_at", days: logsDays, extra: `"resolved_at" IS NOT NULL`},
		{table: "sec_container_event", col: "occurred_at", days: logsDays},
		{table: "sec_malware_event", col: "occurred_at", days: logsDays},
		{table: "sec_cloud_finding", col: "created_at", days: logsDays, extra: `"status" <> 'OPEN'`},
		{table: "net_syslog_event", col: "recorded_at", days: logsDays},
		{table: "net_firewall_event", col: "logged_at", days: logsDays},
		{table: "vms_finding", col: "detected_at", days: logsDays, extra: `"resolved_at" IS NOT NULL`},
		{table: "web_access_log", col: "logged_at", days: logsDays},
		{table: "app_user_action", col: "created_at", days: logsDays},
		{table: "app_webhook_delivery", col: "created_at", days: logsDays},
		{table: "app_integration_sync", col: "created_at", days: logsDays},
		{table: "amm_api_log", col: "created_at", days: logsDays},
		{table: "pam_command", col: "executed_at", days: logsDays},
		{table: "pod_action", col: "created_at", days: logsDays},
	}

	// Report/rollup: agregat historis (default RE_REPORT).
	reports := []retentionRule{
		{table: "obs_metric_rollup", col: "bucket", days: reportDays},
		{table: "net_interface_stat_rollup", col: "bucket", days: reportDays},
		{table: "net_sensor_stat_rollup", col: "bucket", days: reportDays},
		{table: "web_access_stat", col: "bucket", days: reportDays},
		{table: "net_availability", col: "changed_at", days: reportDays},
		{table: "net_billing", col: "created_at", days: reportDays},
		{table: "sec_compliance_report", col: "generated_at", days: reportDays},
	}

	groups := [][]retentionRule{telemetry, logs, reports}
	all := make([]retentionRule, 0, len(telemetry)+len(logs)+len(reports))
	for _, group := range groups {
		for _, r := range group {
			r.days = tableDays(r.table, r.days)
			all = append(all, r)
		}
	}
	return all
}

func tableDays(table string, def int) int {
	if v := envInt("RE_DAYS_"+strings.ToUpper(table), 0); v > 0 {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return def
	}
	return v
}

// RunDataRetention menghapus data telemetri/log/report yang lebih tua dari
// batas retensi, berulang tiap RE_INTERVAL jam (default 1 jam). Dipanggil
// sekali dari main dengan `go ...`.
func RunDataRetention() {
	if strings.EqualFold(os.Getenv("RE_FLAG"), "false") {
		Log.Info().Msg("data retention disabled (RE_FLAG=false)")
		return
	}
	rules := retentionRules()
	interval := envInt("RE_INTERVAL", 1)
	if interval <= 0 {
		interval = 1
	}
	Log.Info().
		Int("rules", len(rules)).
		Int("interval_hours", interval).
		Msg("data retention started")
	for {
		runDataRetention(rules)
		time.Sleep(time.Duration(interval) * time.Hour)
	}
}

func runDataRetention(rules []retentionRule) {
	for _, r := range rules {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		n, err := purgeTable(ctx, r)
		cancel()
		if err != nil {
			Log.Warn().Err(err).Str("table", r.table).Msg("retention failed")
			continue
		}
		if n > 0 {
			Log.Info().Str("table", r.table).Int64("count", n).Int("days", r.days).Msg("retention purged")
		}
	}
}

// purgeTable menghapus baris lama secara bertahap (batch) agar tidak mengunci
// tabel besar terlalu lama.
func purgeTable(ctx context.Context, r retentionRule) (int64, error) {
	where := fmt.Sprintf(`%q IS NOT NULL AND %q < NOW() - ($1 * interval '1 day')`, r.col, r.col)
	if r.extra != "" {
		where += " AND " + r.extra
	}
	stmt := fmt.Sprintf(
		`DELETE FROM %q WHERE ctid IN (SELECT ctid FROM %q WHERE %s LIMIT $2)`,
		r.table, r.table, where)
	var total int64
	for {
		cmd, err := PgSQL.Exec(ctx, stmt, r.days, retentionBatch)
		if err != nil {
			return total, err
		}
		n := cmd.RowsAffected()
		total += n
		if n < retentionBatch {
			return total, nil
		}
	}
}
