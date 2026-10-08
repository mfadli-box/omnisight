package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

// --- helpers ---

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func fmtTimeVal(t time.Time) string {
	return t.Format(time.RFC3339)
}

func fmtTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

// --- User Session ---

const sessionColumns = `
	s.id, s.user_id, COALESCE(u.username, ''), COALESCE(u.fullname, ''),
	s.session_token, s.ip_address, s.user_agent,
	s.started_at, s.last_active, s.ended_at, s.status, s.policy_id`

func sessionGet(ctx context.Context, db *pgxpool.Pool, id string) (SessionResponse, error) {
	var r SessionResponse
	var startedAt, lastActive time.Time
	var endedAt *time.Time
	err := db.QueryRow(ctx, `
		SELECT	`+sessionColumns+`
		FROM	app_user_session s
		LEFT	JOIN app_user u ON u.id = s.user_id
		WHERE	s.id = $1`, id).Scan(
		&r.ID, &r.UserID, &r.Username, &r.Fullname, &r.SessionToken,
		&r.IPAddress, &r.UserAgent, &startedAt, &lastActive, &endedAt,
		&r.Status, &r.PolicyID)
	if err != nil {
		return SessionResponse{}, err
	}
	r.StartedAt = fmtTimeVal(startedAt)
	r.LastActive = fmtTimeVal(lastActive)
	r.EndedAt = fmtTimePtr(endedAt)
	return r, nil
}

func sessionList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[SessionResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			COALESCE(u.username, '') ILIKE $%d OR
			COALESCE(u.fullname, '') ILIKE $%d OR
			s.status ILIKE $%d OR
			COALESCE(s.ip_address, '') ILIKE $%d OR
			s.session_token ILIKE $%d
		)`, argn, argn, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_user_session s
		LEFT	JOIN app_user u ON u.id = s.user_id
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[SessionResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"username":    "u.username",
		"status":      "s.status",
		"ip_address":  "s.ip_address",
		"started_at":  "s.started_at",
		"last_active": "s.last_active",
	}, "s.started_at")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	` + sessionColumns + `
		FROM	app_user_session s
		LEFT	JOIN app_user u ON u.id = s.user_id
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[SessionResponse]{}, err
	}
	defer rows.Close()
	list := []SessionResponse{}
	for rows.Next() {
		var r SessionResponse
		var startedAt, lastActive time.Time
		var endedAt *time.Time
		if err := rows.Scan(&r.ID, &r.UserID, &r.Username, &r.Fullname,
			&r.SessionToken, &r.IPAddress, &r.UserAgent, &startedAt, &lastActive,
			&endedAt, &r.Status, &r.PolicyID); err != nil {
			return mechanic.Page[SessionResponse]{}, err
		}
		r.StartedAt = fmtTimeVal(startedAt)
		r.LastActive = fmtTimeVal(lastActive)
		r.EndedAt = fmtTimePtr(endedAt)
		list = append(list, r)
	}
	return mechanic.Page[SessionResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func sessionCreate(ctx context.Context, db *pgxpool.Pool, in SessionCreate) (SessionResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_user_session (
			id, user_id, session_token, ip_address, user_agent, status, policy_id
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6
		) RETURNING id`,
		in.UserID, in.SessionToken, in.IPAddress, in.UserAgent,
		in.Status, in.PolicyID).Scan(&id)
	if err != nil {
		return SessionResponse{}, err
	}
	return sessionGet(ctx, db, id)
}

func sessionUpdate(ctx context.Context, db *pgxpool.Pool, id string, in SessionUpdate) (SessionResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.IPAddress != nil {
		argn++
		args = append(args, nullableString(*in.IPAddress))
		sets = append(sets, fmt.Sprintf("ip_address = $%d", argn))
	}
	if in.UserAgent != nil {
		argn++
		args = append(args, nullableString(*in.UserAgent))
		sets = append(sets, fmt.Sprintf("user_agent = $%d", argn))
	}
	if in.Status != nil {
		argn++
		args = append(args, *in.Status)
		sets = append(sets, fmt.Sprintf("status = $%d", argn))
	}
	if in.PolicyID != nil {
		argn++
		args = append(args, nullableString(*in.PolicyID))
		sets = append(sets, fmt.Sprintf("policy_id = $%d", argn))
	}
	if in.End != nil {
		if *in.End {
			sets = append(sets, "ended_at = now()", "status = 'ENDED'")
		} else {
			sets = append(sets, "ended_at = NULL")
		}
	}
	if len(sets) == 0 {
		return sessionGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_user_session
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`
		WHERE	id = $%d
	`, argn)
	if _, err := db.Exec(ctx, q, args...); err != nil {
		return SessionResponse{}, err
	}
	return sessionGet(ctx, db, id)
}

func sessionDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_user_session WHERE id = $1", id)
	return err
}

// --- User Token ---

const tokenColumns = `
	t.id, t.user_id, COALESCE(u.username, ''), COALESCE(u.fullname, ''),
	t.token_type, t.token, t.refresh_token, t.fingerprint, t.ip_address,
	t.user_agent, t.device_id, t.issued_at, t.access_expires_at,
	t.refresh_expires_at, t.last_activity_at, t.is_blocked, t.blocked_reason,
	t.impersonated_by, t.revoked_at, t.revoked_reason, t.created_at`

func tokenGet(ctx context.Context, db *pgxpool.Pool, id string) (TokenResponse, error) {
	var r TokenResponse
	var issuedAt, accessExpiresAt, createdAt time.Time
	var refreshExpiresAt, lastActivityAt, revokedAt *time.Time
	err := db.QueryRow(ctx, `
		SELECT	`+tokenColumns+`
		FROM	app_user_token t
		LEFT	JOIN app_user u ON u.id = t.user_id
		WHERE	t.id = $1`, id).Scan(
		&r.ID, &r.UserID, &r.Username, &r.Fullname, &r.TokenType, &r.Token,
		&r.RefreshToken, &r.Fingerprint, &r.IPAddress, &r.UserAgent, &r.DeviceID,
		&issuedAt, &accessExpiresAt, &refreshExpiresAt, &lastActivityAt,
		&r.IsBlocked, &r.BlockedReason, &r.ImpersonatedBy, &revokedAt,
		&r.RevokedReason, &createdAt)
	if err != nil {
		return TokenResponse{}, err
	}
	r.IssuedAt = fmtTimeVal(issuedAt)
	r.AccessExpiresAt = fmtTimeVal(accessExpiresAt)
	r.RefreshExpiresAt = fmtTimePtr(refreshExpiresAt)
	r.LastActivityAt = fmtTimePtr(lastActivityAt)
	r.RevokedAt = fmtTimePtr(revokedAt)
	r.CreatedAt = fmtTimeVal(createdAt)
	return r, nil
}

func tokenList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[TokenResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			COALESCE(u.username, '') ILIKE $%d OR
			COALESCE(u.fullname, '') ILIKE $%d OR
			t.token_type ILIKE $%d OR
			COALESCE(t.ip_address, '') ILIKE $%d OR
			t.token ILIKE $%d
		)`, argn, argn, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_user_token t
		LEFT	JOIN app_user u ON u.id = t.user_id
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[TokenResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"username":          "u.username",
		"token_type":        "t.token_type",
		"is_blocked":        "t.is_blocked",
		"issued_at":         "t.issued_at",
		"access_expires_at": "t.access_expires_at",
		"revoked_at":        "t.revoked_at",
		"created_at":        "t.created_at",
	}, "t.issued_at")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	` + tokenColumns + `
		FROM	app_user_token t
		LEFT	JOIN app_user u ON u.id = t.user_id
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[TokenResponse]{}, err
	}
	defer rows.Close()
	list := []TokenResponse{}
	for rows.Next() {
		var r TokenResponse
		var issuedAt, accessExpiresAt, createdAt time.Time
		var refreshExpiresAt, lastActivityAt, revokedAt *time.Time
		if err := rows.Scan(&r.ID, &r.UserID, &r.Username, &r.Fullname,
			&r.TokenType, &r.Token, &r.RefreshToken, &r.Fingerprint,
			&r.IPAddress, &r.UserAgent, &r.DeviceID, &issuedAt,
			&accessExpiresAt, &refreshExpiresAt, &lastActivityAt, &r.IsBlocked,
			&r.BlockedReason, &r.ImpersonatedBy, &revokedAt, &r.RevokedReason,
			&createdAt); err != nil {
			return mechanic.Page[TokenResponse]{}, err
		}
		r.IssuedAt = fmtTimeVal(issuedAt)
		r.AccessExpiresAt = fmtTimeVal(accessExpiresAt)
		r.RefreshExpiresAt = fmtTimePtr(refreshExpiresAt)
		r.LastActivityAt = fmtTimePtr(lastActivityAt)
		r.RevokedAt = fmtTimePtr(revokedAt)
		r.CreatedAt = fmtTimeVal(createdAt)
		list = append(list, r)
	}
	return mechanic.Page[TokenResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func tokenCreate(ctx context.Context, db *pgxpool.Pool, in TokenCreate) (TokenResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_user_token (
			id, user_id, token_type, token, refresh_token, fingerprint,
			ip_address, user_agent, device_id, access_expires_at,
			refresh_expires_at, is_blocked, blocked_reason
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8,
			$9::timestamp, $10::timestamp, $11, $12
		) RETURNING id`,
		in.UserID, in.TokenType, in.Token, in.RefreshToken, in.Fingerprint,
		in.IPAddress, in.UserAgent, in.DeviceID, in.AccessExpiresAt,
		in.RefreshExpiresAt, in.IsBlocked, in.BlockedReason).Scan(&id)
	if err != nil {
		return TokenResponse{}, err
	}
	return tokenGet(ctx, db, id)
}

func tokenUpdate(ctx context.Context, db *pgxpool.Pool, id string, in TokenUpdate) (TokenResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.TokenType != nil {
		argn++
		args = append(args, *in.TokenType)
		sets = append(sets, fmt.Sprintf("token_type = $%d", argn))
	}
	if in.Fingerprint != nil {
		argn++
		args = append(args, nullableString(*in.Fingerprint))
		sets = append(sets, fmt.Sprintf("fingerprint = $%d", argn))
	}
	if in.IPAddress != nil {
		argn++
		args = append(args, nullableString(*in.IPAddress))
		sets = append(sets, fmt.Sprintf("ip_address = $%d", argn))
	}
	if in.UserAgent != nil {
		argn++
		args = append(args, nullableString(*in.UserAgent))
		sets = append(sets, fmt.Sprintf("user_agent = $%d", argn))
	}
	if in.DeviceID != nil {
		argn++
		args = append(args, nullableString(*in.DeviceID))
		sets = append(sets, fmt.Sprintf("device_id = $%d", argn))
	}
	if in.AccessExpiresAt != nil {
		argn++
		args = append(args, *in.AccessExpiresAt)
		sets = append(sets, fmt.Sprintf("access_expires_at = $%d::timestamp", argn))
	}
	if in.RefreshExpiresAt != nil {
		argn++
		args = append(args, nullableString(*in.RefreshExpiresAt))
		sets = append(sets, fmt.Sprintf("refresh_expires_at = $%d::timestamp", argn))
	}
	if in.IsBlocked != nil {
		argn++
		args = append(args, *in.IsBlocked)
		sets = append(sets, fmt.Sprintf("is_blocked = $%d", argn))
	}
	if in.BlockedReason != nil {
		argn++
		args = append(args, nullableString(*in.BlockedReason))
		sets = append(sets, fmt.Sprintf("blocked_reason = $%d", argn))
	}
	if in.Revoke != nil {
		if *in.Revoke {
			sets = append(sets, "revoked_at = now()")
		} else {
			sets = append(sets, "revoked_at = NULL")
		}
	}
	if in.RevokedReason != nil {
		argn++
		args = append(args, nullableString(*in.RevokedReason))
		sets = append(sets, fmt.Sprintf("revoked_reason = $%d", argn))
	}
	if len(sets) == 0 {
		return tokenGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_user_token
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`
		WHERE	id = $%d
	`, argn)
	if _, err := db.Exec(ctx, q, args...); err != nil {
		return TokenResponse{}, err
	}
	return tokenGet(ctx, db, id)
}

func tokenDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_user_token WHERE id = $1", id)
	return err
}
