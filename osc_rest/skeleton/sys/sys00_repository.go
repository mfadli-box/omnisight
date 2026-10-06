package sys

import (
	"context"
	"fmt"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

func profileByID(ctx context.Context, db *pgxpool.Pool, userID string) (ProfileResponse, error) {
	var p ProfileResponse
	var phone *string
	err := db.QueryRow(ctx, `
		SELECT	u.id, u.username, u.email, u.fullname, u.phone, u.role, u.job,
				u.company_id, COALESCE(c.name, ''), u.is_admin, u.is_hris, u.is_active
		FROM	app_user u
		LEFT	JOIN app_company c ON c.id = u.company_id
		WHERE	u.id = $1`, userID).Scan(
		&p.ID, &p.Username, &p.Email, &p.Fullname, &phone, &p.Role, &p.Job,
		&p.CompanyID, &p.CompanyName, &p.IsAdmin, &p.IsHris, &p.IsActive,
	)
	p.Phone = phone
	if err != nil {
		return ProfileResponse{}, err
	}
	companies, err := userCompanyList(ctx, db, userID)
	if err != nil {
		return ProfileResponse{}, err
	}
	p.Companies = companies
	return p, nil
}

func userCompanyList(ctx context.Context, db *pgxpool.Pool, userID string) ([]CompanyItem, error) {
	rows, err := db.Query(ctx, `
		SELECT	c.id, c.code, c.name
		FROM	app_user_company uc
		JOIN	app_company c ON c.id = uc.company_id
		WHERE	uc.user_id = $1
		  AND	uc.is_active = true
		  AND	c.is_active = true
		ORDER	BY c.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []CompanyItem{}
	for rows.Next() {
		var item CompanyItem
		if err := rows.Scan(&item.CompanyID, &item.Code, &item.Name); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

func passwordHashByID(ctx context.Context, db *pgxpool.Pool, userID string) (string, error) {
	var hash string
	err := db.QueryRow(ctx, `
		SELECT	password
		FROM	app_user
		WHERE	id = $1`, userID).Scan(&hash)
	return hash, err
}

func updatePasswordHash(ctx context.Context, db *pgxpool.Pool, userID, hash string) error {
	_, err := db.Exec(ctx, `
		UPDATE	app_user
		SET		password = $2,
				updated_at = now()
		WHERE	id = $1`, userID, hash)
	return err
}

func historyList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams, userID string) (mechanic.Page[HistoryResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if userID != "" {
		argn++
		args = append(args, userID)
		where += fmt.Sprintf(` AND user_id = $%d`, argn)
	}
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			token_type ILIKE $%d OR
			COALESCE(ip_address, '') ILIKE $%d OR
			COALESCE(user_agent, '') ILIKE $%d
		)`, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_user_token
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[HistoryResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"token_type":        "token_type",
		"issued_at":         "issued_at",
		"access_expires_at": "access_expires_at",
		"created_at":        "created_at",
	}, "issued_at")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	id, token_type, ip_address, user_agent, issued_at::text,
				access_expires_at::text, is_blocked, revoked_at::text,
				revoked_reason, created_at::text
		FROM	app_user_token
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[HistoryResponse]{}, err
	}
	defer rows.Close()
	list := []HistoryResponse{}
	for rows.Next() {
		var r HistoryResponse
		if err := rows.Scan(
			&r.ID, &r.TokenType, &r.IPAddress, &r.UserAgent, &r.IssuedAt,
			&r.AccessExpiresAt, &r.IsBlocked, &r.RevokedAt, &r.RevokedReason,
			&r.CreatedAt); err != nil {
			return mechanic.Page[HistoryResponse]{}, err
		}
		list = append(list, r)
	}
	return mechanic.Page[HistoryResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}
