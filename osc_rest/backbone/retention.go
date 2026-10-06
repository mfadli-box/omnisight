package backbone

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type retentionRule struct {
	table string
	col   string
	days  int
}

func retentionRules() []retentionRule {
	tableDays := func(table string, def int) int {
		if v := envInt("RE_DAYS_"+table, 0); v > 0 {
			return v
		}
		return def
	}
	telemetry := []retentionRule{}
	logs := []retentionRule{}
	all := make([]retentionRule, 0, len(telemetry)+len(logs))
	for _, r := range telemetry {
		r.days = tableDays(strings.ToUpper(r.table), r.days)
		all = append(all, r)
	}
	for _, r := range logs {
		r.days = tableDays(strings.ToUpper(r.table), r.days)
		all = append(all, r)
	}
	return all
}

func envInt(key string, def int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return def
	}
	return v
}

func RunDataRetention() {
	if strings.EqualFold(os.Getenv("RE_FLAG"), "false") {
		Log.Info().Msg("data retention disabled (RE_FLAG=false)")
		return
	}
	rules := retentionRules()
	Log.Info().Int("rules", len(rules)).Msg("data retention started")
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		for _, r := range rules {
			stmt := fmt.Sprintf(
				`DELETE FROM %q WHERE %q IS NOT NULL AND %q < NOW() - ($1 * interval '1 day')`,
				r.table, r.col, r.col)
			cmd, err := PgSQL.Exec(ctx, stmt, r.days)
			if err != nil {
				Log.Warn().Err(err).Str("table", r.table).Msg("retention failed")
				continue
			}
			if n := cmd.RowsAffected(); n > 0 {
				Log.Info().Str("table", r.table).Int64("count", n).Int("days", r.days).Msg("retention purged")
			}
		}
		cancel()
		time.Sleep(1 * time.Hour)
	}
}
