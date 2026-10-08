// Package applink menyediakan sinkronisasi otomatis baris tautan antar entitas
// admin. Aturan (default non-aktif / HIDE):
//
//  1. insert app_company atau app_module      → app_company_module  (is_active=false)
//  2. insert app_company atau app_user        → app_user_company    (is_active=false)
//  3. insert app_user_company atau app_module → app_user_privilege  (level=HIDE)
//
// Seluruh operasi memakai INSERT ... SELECT ON CONFLICT DO NOTHING sehingga
// aman diulang dan tidak menimpa data yang sudah ada.
package applink

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
)

// DB adalah subset pgxpool.Pool / pgx.Tx yang dipakai helper ini, sehingga
// dapat dijalankan di dalam transaksi pemanggil.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// --- 1. app_company_module ---

// SyncCompanyModulesForCompany menautkan company baru ke seluruh module.
func SyncCompanyModulesForCompany(ctx context.Context, db DB, companyID string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO app_company_module (id, company_id, module_id, is_active)
		SELECT gen_random_uuid()::text, $1, m.id, false
		FROM app_module m
		ON CONFLICT (company_id, module_id) DO NOTHING`, companyID)
	return err
}

// SyncCompanyModulesForModule menautkan module baru ke seluruh company.
func SyncCompanyModulesForModule(ctx context.Context, db DB, moduleID string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO app_company_module (id, company_id, module_id, is_active)
		SELECT gen_random_uuid()::text, c.id, $1, false
		FROM app_company c
		ON CONFLICT (company_id, module_id) DO NOTHING`, moduleID)
	return err
}

// SyncUserCompaniesForCompany membuat tautan app_user_company untuk seluruh
// user pada perusahaan baru, lalu hak akses HIDE untuk tiap modul.
func SyncUserCompaniesForCompany(ctx context.Context, db DB, companyID string) error {
	if _, err := db.Exec(ctx, `
		INSERT INTO app_user_company (id, user_id, company_id, is_active)
		SELECT gen_random_uuid()::text, u.id, $1, false
		FROM app_user u
		ON CONFLICT (user_id, company_id) DO NOTHING`, companyID); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `
		INSERT INTO app_user_privilege (id, user_company_id, module_id, level)
		SELECT gen_random_uuid()::text, uc.id, m.id, 'HIDE'
		FROM app_user_company uc
		CROSS JOIN app_module m
		WHERE uc.company_id = $1
		ON CONFLICT (user_company_id, module_id) DO NOTHING`, companyID)
	return err
}

// SyncUserCompaniesForUser membuat tautan app_user_company untuk seluruh
// perusahaan pada user baru, lalu hak akses HIDE untuk tiap modul.
func SyncUserCompaniesForUser(ctx context.Context, db DB, userID string) error {
	if _, err := db.Exec(ctx, `
		INSERT INTO app_user_company (id, user_id, company_id, is_active)
		SELECT gen_random_uuid()::text, $1, c.id, false
		FROM app_company c
		ON CONFLICT (user_id, company_id) DO NOTHING`, userID); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `
		INSERT INTO app_user_privilege (id, user_company_id, module_id, level)
		SELECT gen_random_uuid()::text, uc.id, m.id, 'HIDE'
		FROM app_user_company uc
		CROSS JOIN app_module m
		WHERE uc.user_id = $1
		ON CONFLICT (user_company_id, module_id) DO NOTHING`, userID)
	return err
}

// SyncPrivilegesForUserCompany membuat baris app_user_privilege level HIDE
// untuk seluruh modul pada sebuah tautan user-company.
func SyncPrivilegesForUserCompany(ctx context.Context, db DB, userCompanyID string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO app_user_privilege (id, user_company_id, module_id, level)
		SELECT gen_random_uuid()::text, $1, m.id, 'HIDE'
		FROM app_module m
		ON CONFLICT (user_company_id, module_id) DO NOTHING`, userCompanyID)
	return err
}

// SyncPrivilegesForModule membuat hak akses HIDE untuk modul baru pada seluruh
// tautan app_user_company yang ada.
func SyncPrivilegesForModule(ctx context.Context, db DB, moduleID string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO app_user_privilege (id, user_company_id, module_id, level)
		SELECT gen_random_uuid()::text, uc.id, $1, 'HIDE'
		FROM app_user_company uc
		ON CONFLICT (user_company_id, module_id) DO NOTHING`, moduleID)
	return err
}
