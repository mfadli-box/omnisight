package pub

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var pg *pgxpool.Pool

func Use(p *pgxpool.Pool) {
	pg = p
}

type appUser struct {
	ID             string
	Username       string
	Email          string
	Password       string
	Fullname       string
	Phone          *string
	CompanyID      string
	EmployeeID     *string
	LocationID     *string
	DepartmentID   *string
	DivisionID     *string
	Role           string
	Job            string
	Key            string
	IsAdmin        bool
	IsHris         bool
	IsActive       bool
	IsTOTPEnabled  bool
	TOTPSecret     *string
	LockedUntil    *time.Time
	FailedAttempts int
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

const appUserCols = `
	id, username, email, password, fullname, phone, company_id,
	employee_id, location_id, department_id, division_id, role, job,
	key, is_admin, is_hris, is_active, is_totp_enabled, totp_secret,
	locked_until, failed_attempts, created_at, updated_at
`

func scanAppUser(r pgx.Row) (appUser, error) {
	var m appUser
	err := r.Scan(
		&m.ID, &m.Username, &m.Email, &m.Password, &m.Fullname, &m.Phone, &m.CompanyID,
		&m.EmployeeID, &m.LocationID, &m.DepartmentID, &m.DivisionID, &m.Role, &m.Job,
		&m.Key, &m.IsAdmin, &m.IsHris, &m.IsActive, &m.IsTOTPEnabled, &m.TOTPSecret,
		&m.LockedUntil, &m.FailedAttempts, &m.CreatedAt, &m.UpdatedAt,
	)
	return m, err
}

func companyOptions(ctx context.Context) ([]CompanyOption, error) {
	rows, err := pg.Query(ctx, `
		SELECT id, code, name FROM app_company
		WHERE  is_active = true
		ORDER  BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []CompanyOption{}
	for rows.Next() {
		var c CompanyOption
		if err := rows.Scan(&c.ID, &c.Code, &c.Name); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func findUserByLogin(ctx context.Context, db *pgxpool.Pool, companyID, username string) (appUser, error) {
	query := `
		SELECT ` + appUserCols + `
		FROM	app_user
		WHERE	username = $1 AND company_id = $2
		LIMIT 1`
	return scanAppUser(db.QueryRow(ctx, query, username, companyID))
}

func companyName(ctx context.Context, db *pgxpool.Pool, id string) (string, error) {
	var name string
	err := db.QueryRow(ctx, `
		SELECT	name FROM app_company
		WHERE	id = $1`, id).Scan(&name)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return name, err
}

func companyHrisLink(ctx context.Context, db *pgxpool.Pool, id string) (string, error) {
	var hrisLink string
	err := db.QueryRow(ctx, `
		SELECT	COALESCE(hris_link, '') FROM app_company
		WHERE	id = $1`, id).Scan(&hrisLink)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return hrisLink, err
}

func updateUserKey(ctx context.Context, db *pgxpool.Pool, userID, key string) error {
	_, err := db.Exec(ctx, `
		UPDATE	app_user
		SET		key = $2, updated_at = now()
		WHERE	id = $1`, userID, key)
	return err
}

type appUserTokenCreate struct {
	UserID          string
	TokenType       string
	Token           string
	IPAddress       *string
	UserAgent       *string
	AccessExpiresAt time.Time
}

type appUserToken struct {
	ID               string
	UserID           string
	TokenType        string
	Token            string
	IPAddress        *string
	UserAgent        *string
	Fingerprint      *string
	IssuedAt         time.Time
	AccessExpiresAt  time.Time
	RefreshExpiresAt *time.Time
	IsBlocked        bool
	RevokedAt        *time.Time
	RevokedReason    *string
	CreatedAt        time.Time
}

func createSession(ctx context.Context, db *pgxpool.Pool, in appUserTokenCreate) (appUserToken, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_user_token (
			id, user_id, token_type, token, ip_address, user_agent,
			access_expires_at, issued_at
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now()
		) RETURNING id`,
		in.UserID, in.TokenType, in.Token, in.IPAddress, in.UserAgent,
		in.AccessExpiresAt).Scan(&id)
	if err != nil {
		return appUserToken{}, err
	}
	var t appUserToken
	err = db.QueryRow(ctx, `
		SELECT	id, user_id, token_type, token, ip_address, user_agent,
				fingerprint, issued_at, access_expires_at,
				refresh_expires_at, is_blocked, revoked_at,
				revoked_reason, created_at
		FROM	app_user_token
		WHERE	id = $1`, id).Scan(
		&t.ID, &t.UserID, &t.TokenType, &t.Token, &t.IPAddress, &t.UserAgent,
		&t.Fingerprint, &t.IssuedAt, &t.AccessExpiresAt, &t.RefreshExpiresAt,
		&t.IsBlocked, &t.RevokedAt, &t.RevokedReason, &t.CreatedAt,
	)
	return t, err
}

func recordFailedAttempt(ctx context.Context, db *pgxpool.Pool, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE	app_user
		SET		failed_attempts = failed_attempts + 1,
				updated_at = now()
		WHERE id = $1`, userID)
	if err != nil {
		return err
	}
	var attempts int
	err = db.QueryRow(ctx, `
		SELECT	failed_attempts FROM app_user
		WHERE	id = $1`, userID).Scan(&attempts)
	if err != nil {
		return err
	}
	if attempts >= maxLoginAttempts {
		_, err = db.Exec(ctx, `
			UPDATE	app_user
			SET		locked_until = now() + make_interval(mins => $2),
					updated_at = now()
			WHERE	id = $1`, userID, int(lockDuration.Minutes()))
	}
	return err
}

func resetFailedAttempt(ctx context.Context, db *pgxpool.Pool, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE	app_user
		SET		failed_attempts = 0,
				locked_until = NULL,
				updated_at = now()
		WHERE	id = $1`, userID)
	return err
}
