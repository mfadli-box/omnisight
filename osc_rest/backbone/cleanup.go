package backbone

import (
	"context"
	"time"
)

// CleanupExpiredSessions berjalan periodik membersihkan sesi idle dan token
// akses yang telah kedaluwarsa. Dipanggil sekali dari main dengan `go ...`
// sehingga loop di dalamnya menjaga pembersihan tetap berjalan.
func CleanupExpiredSessions() {
	runCleanup()
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		runCleanup()
	}
}

func runCleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd, err := PgSQL.Exec(ctx,
		`UPDATE "app_user_session" SET status = 'EXPIRED', ended_at = COALESCE(ended_at, NOW())
		 WHERE status = 'ACTIVE' AND last_active < NOW() - interval '30 minutes'`)
	if err != nil {
		Log.Warn().Err(err).Msg("session cleanup failed")
	} else if n := cmd.RowsAffected(); n > 0 {
		Log.Info().Int64("count", n).Msg("expired sessions closed")
	}

	cmd, err = PgSQL.Exec(ctx,
		`DELETE FROM "app_user_token"
		 WHERE access_expires_at < NOW() - interval '1 day'
		   AND (refresh_expires_at IS NULL OR refresh_expires_at < NOW())`)
	if err != nil {
		Log.Warn().Err(err).Msg("token cleanup failed")
	} else if n := cmd.RowsAffected(); n > 0 {
		Log.Info().Int64("count", n).Msg("expired tokens purged")
	}
}
