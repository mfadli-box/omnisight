package app

import (
	"context"
	"fmt"
	"strings"

	"osc_rest/mechanic"
	"osc_rest/skeleton/app/applink"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func companyList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[CompanyResponse], error) {
	p.Default()
	where := ``
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` WHERE (
			code ILIKE $%d OR
			name ILIKE $%d
		)`, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT count(*) FROM app_company
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[CompanyResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"code":       "code",
		"name":       "name",
		"is_active":  "is_active",
		"created_at": "created_at",
	}, "name")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	id, code, name, vat_id, reg_no, tax_office, address, valuta,
				hris_link, is_active, created_at::text, updated_at::text
		FROM	app_company
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[CompanyResponse]{}, err
	}
	defer rows.Close()
	list := []CompanyResponse{}
	for rows.Next() {
		var r CompanyResponse
		if err := rows.Scan(
			&r.ID, &r.Code, &r.Name, &r.VatID, &r.RegNo, &r.TaxOffice,
			&r.Address, &r.Valuta, &r.HrisLink, &r.IsActive, &r.CreatedAt,
			&r.UpdatedAt); err != nil {
			return mechanic.Page[CompanyResponse]{}, err
		}
		list = append(list, r)
	}
	return mechanic.Page[CompanyResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func companyGet(ctx context.Context, db *pgxpool.Pool, id string) (CompanyResponse, error) {
	var r CompanyResponse
	err := db.QueryRow(ctx, `
		SELECT	id, code, name, vat_id, reg_no, tax_office, address,
				valuta, hris_link, is_active, created_at::text, updated_at::text
		FROM	app_company
		WHERE	id = $1 `, id).Scan(
		&r.ID, &r.Code, &r.Name, &r.VatID, &r.RegNo, &r.TaxOffice,
		&r.Address, &r.Valuta, &r.HrisLink, &r.IsActive, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func companyCreate(ctx context.Context, db *pgxpool.Pool, in CompanyCreate) (CompanyResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return CompanyResponse{}, err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO app_company (
			id, code, name, vat_id, reg_no, tax_office, address, valuta, hris_link, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9
		) RETURNING id`,
		in.Code, in.Name, in.VatID, in.RegNo, in.TaxOffice, in.Address, in.Valuta, in.HrisLink,
		in.IsActive).Scan(&id)
	if err != nil {
		return CompanyResponse{}, err
	}
	if err := applink.SyncCompanyModulesForCompany(ctx, tx, id); err != nil {
		return CompanyResponse{}, err
	}
	if err := applink.SyncUserCompaniesForCompany(ctx, tx, id); err != nil {
		return CompanyResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return CompanyResponse{}, err
	}
	return companyGet(ctx, db, id)
}

func companyUpdate(ctx context.Context, db *pgxpool.Pool, id string, in CompanyUpdate) (CompanyResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.Code != nil {
		argn++
		args = append(args, *in.Code)
		sets = append(sets, fmt.Sprintf("code = $%d", argn))
	}
	if in.Name != nil {
		argn++
		args = append(args, *in.Name)
		sets = append(sets, fmt.Sprintf("name = $%d", argn))
	}
	if in.VatID != nil {
		argn++
		args = append(args, *in.VatID)
		sets = append(sets, fmt.Sprintf("vat_id = $%d", argn))
	}
	if in.RegNo != nil {
		argn++
		args = append(args, *in.RegNo)
		sets = append(sets, fmt.Sprintf("reg_no = $%d", argn))
	}
	if in.TaxOffice != nil {
		argn++
		args = append(args, *in.TaxOffice)
		sets = append(sets, fmt.Sprintf("tax_office = $%d", argn))
	}
	if in.Address != nil {
		argn++
		args = append(args, *in.Address)
		sets = append(sets, fmt.Sprintf("address = $%d", argn))
	}
	if in.Valuta != nil {
		argn++
		args = append(args, *in.Valuta)
		sets = append(sets, fmt.Sprintf("valuta = $%d", argn))
	}
	if in.HrisLink != nil {
		argn++
		args = append(args, *in.HrisLink)
		sets = append(sets, fmt.Sprintf("hris_link = $%d", argn))
	}
	if in.IsActive != nil {
		argn++
		args = append(args, *in.IsActive)
		sets = append(sets, fmt.Sprintf("is_active = $%d", argn))
	}
	if len(sets) == 0 {
		return companyGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_company
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return CompanyResponse{}, err
	}
	return companyGet(ctx, db, id)
}

func companyDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		DELETE FROM app_user_privilege
		WHERE user_company_id IN (SELECT id FROM app_user_company WHERE company_id = $1)`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_user_company WHERE company_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_company_module WHERE company_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_company WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func companyModuleList(ctx context.Context, db *pgxpool.Pool, companyID string) ([]CompanyModuleResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	cm.id, cm.company_id, cm.module_id, m.name, m.code, cm.is_active, cm.created_at::text
		FROM	app_company_module cm
		JOIN	app_module m ON m.id = cm.module_id
		WHERE	cm.company_id = $1
		ORDER	BY m.name`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []CompanyModuleResponse{}
	for rows.Next() {
		var r CompanyModuleResponse
		if err := rows.Scan(
			&r.ID, &r.CompanyID, &r.ModuleID, &r.ModuleName, &r.ModuleCode, &r.IsActive,
			&r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func companyModuleCreate(ctx context.Context, db *pgxpool.Pool, companyID string, in CompanyModuleCreate) (CompanyModuleResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_company_module (
			id, company_id, module_id, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3
		) RETURNING id`,
		companyID, in.ModuleID, in.IsActive).Scan(&id)
	if err != nil {
		return CompanyModuleResponse{}, err
	}
	var r CompanyModuleResponse
	err = db.QueryRow(ctx, `
		SELECT	cm.id, cm.company_id, cm.module_id, m.name, m.code, cm.is_active,
				cm.created_at::text
		FROM	app_company_module cm JOIN app_module m ON m.id = cm.module_id
		WHERE	cm.id = $1`, id).Scan(
		&r.ID, &r.CompanyID, &r.ModuleID, &r.ModuleName, &r.ModuleCode,
		&r.IsActive, &r.CreatedAt)
	return r, err
}

func companyModuleUpdate(ctx context.Context, db *pgxpool.Pool, id string, in CompanyModuleUpdate) (CompanyModuleResponse, error) {
	if in.IsActive == nil {
		var r CompanyModuleResponse
		err := db.QueryRow(ctx, `
			SELECT	cm.id, cm.company_id, cm.module_id, m.name, m.code, cm.is_active,
					cm.created_at::text
			FROM	app_company_module cm JOIN app_module m ON m.id = cm.module_id
			WHERE	cm.id = $1
		`, id).Scan(
			&r.ID, &r.CompanyID, &r.ModuleID, &r.ModuleName, &r.ModuleCode, &r.IsActive,
			&r.CreatedAt)
		return r, err
	}
	_, err := db.Exec(ctx, `
		UPDATE	app_company_module
		SET		is_active = $1
		WHERE	id = $2`, *in.IsActive, id)
	if err != nil {
		return CompanyModuleResponse{}, err
	}
	var r CompanyModuleResponse
	err = db.QueryRow(ctx, `
		SELECT	cm.id, cm.company_id, cm.module_id, m.name, m.code, cm.is_active,
				cm.created_at::text
		FROM	app_company_module cm JOIN app_module m ON m.id = cm.module_id
		WHERE	cm.id = $1`, id).Scan(
		&r.ID, &r.CompanyID, &r.ModuleID, &r.ModuleName, &r.ModuleCode, &r.IsActive,
		&r.CreatedAt)
	return r, err
}

func companyModuleDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_company_module WHERE id = $1", id)
	return err
}

func companyAreaList(ctx context.Context, db *pgxpool.Pool, companyID string) ([]CompanyAreaResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	id, company_id, code, name, description, is_active, created_at::text
		FROM	app_company_area
		WHERE	company_id = $1
		ORDER	BY name`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []CompanyAreaResponse{}
	for rows.Next() {
		var r CompanyAreaResponse
		if err := rows.Scan(
			&r.ID, &r.CompanyID, &r.Code, &r.Name, &r.Description, &r.IsActive,
			&r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func companyAreaCreate(ctx context.Context, db *pgxpool.Pool, companyID string, in CompanyAreaCreate) (CompanyAreaResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_company_area (
			id, company_id, code, name, description, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5
		) RETURNING id`,
		companyID, in.Code, in.Name, in.Description, in.IsActive).Scan(&id)
	if err != nil {
		return CompanyAreaResponse{}, err
	}
	var r CompanyAreaResponse
	err = db.QueryRow(ctx, `
		SELECT	id, company_id, code, name, description, is_active,
				created_at::text
		FROM	app_company_area
		WHERE	id = $1`, id).Scan(
		&r.ID, &r.CompanyID, &r.Code, &r.Name, &r.Description, &r.IsActive,
		&r.CreatedAt)
	return r, err
}

func companyAreaUpdate(ctx context.Context, db *pgxpool.Pool, id string, in CompanyAreaUpdate) (CompanyAreaResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.Code != nil {
		argn++
		args = append(args, *in.Code)
		sets = append(sets, fmt.Sprintf("code = $%d", argn))
	}
	if in.Name != nil {
		argn++
		args = append(args, *in.Name)
		sets = append(sets, fmt.Sprintf("name = $%d", argn))
	}
	if in.Description != nil {
		argn++
		args = append(args, *in.Description)
		sets = append(sets, fmt.Sprintf("description = $%d", argn))
	}
	if in.IsActive != nil {
		argn++
		args = append(args, *in.IsActive)
		sets = append(sets, fmt.Sprintf("is_active = $%d", argn))
	}
	if len(sets) == 0 {
		var r CompanyAreaResponse
		err := db.QueryRow(ctx, `
			SELECT	id, company_id, code, name, description, is_active,
					created_at::text
			FROM	app_company_area
			WHERE	id = $1`, id).Scan(
			&r.ID, &r.CompanyID, &r.Code, &r.Name, &r.Description, &r.IsActive,
			&r.CreatedAt)
		return r, err
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_company_area
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`
		WHERE	id = $%d`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return CompanyAreaResponse{}, err
	}
	var r CompanyAreaResponse
	err = db.QueryRow(ctx, `
		SELECT	id, company_id, code, name, description, is_active,
				created_at::text
		FROM	app_company_area
		WHERE	id = $1
	`, id).Scan(
		&r.ID, &r.CompanyID, &r.Code, &r.Name, &r.Description, &r.IsActive,
		&r.CreatedAt)
	return r, err
}

func companyAreaDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_company_area WHERE id = $1", id)
	return err
}

var _ = pgx.ErrNoRows
