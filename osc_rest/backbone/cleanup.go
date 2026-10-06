package backbone

import (
	"context"
	"time"
)

func CleanupExpiredSessions() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd, err := PgSQL.Exec(ctx,
		`UPDATE "app_user_session" SET status = 'EXPIRED', ended_at = COALESCE(ended_at, NOW())
		 WHERE status = 'ACTIVE' AND last_active < NOW() - interval '30 minutes'`)
	if err != nil {
		Log.Warn().Err(err).Msg("session cleanup failed")
		return
	}
	if n := cmd.RowsAffected(); n > 0 {
		Log.Info().Int64("count", n).Msg("expired sessions closed")
	}
}
