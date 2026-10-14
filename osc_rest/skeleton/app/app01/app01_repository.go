package app

import (
	"context"
	"fmt"
	"strings"

	"osc_rest/mechanic"
	"osc_rest/skeleton/app/applink"

	"github.com/jackc/pgx/v5/pgxpool"
)

func moduleList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[ModuleResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			code ILIKE $%d OR
			name ILIKE $%d OR
			path ILIKE $%d
		)`, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_module
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[ModuleResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"code":       "code",
		"name":       "name",
		"path":       "path",
		"is_active":  "is_active",
		"created_at": "created_at",
	}, "name")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	id, parent_id, code, name, path, is_page, is_active,
				created_at::text, updated_at::text
		FROM	app_module
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[ModuleResponse]{}, err
	}
	defer rows.Close()
	list := []ModuleResponse{}
	for rows.Next() {
		var r ModuleResponse
		if err := rows.Scan(
			&r.ID, &r.ParentID, &r.Code, &r.Name, &r.Path, &r.IsPage, &r.IsActive,
			&r.CreatedAt, &r.UpdatedAt); err != nil {
			return mechanic.Page[ModuleResponse]{}, err
		}
		list = append(list, r)
	}
	return mechanic.Page[ModuleResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func moduleGet(ctx context.Context, db *pgxpool.Pool, id string) (ModuleResponse, error) {
	var r ModuleResponse
	err := db.QueryRow(ctx, `
		SELECT	id, parent_id, code, name, path, is_page, is_active,
				created_at::text, updated_at::text
		FROM	app_module
		WHERE	id = $1`, id).Scan(
		&r.ID, &r.ParentID, &r.Code, &r.Name, &r.Path, &r.IsPage, &r.IsActive,
		&r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func moduleCreate(ctx context.Context, db *pgxpool.Pool, in ModuleCreate) (ModuleResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return ModuleResponse{}, err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO app_module (
			id, parent_id, code, name, path, is_page, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6
		) RETURNING id`,
		in.ParentID, in.Code, in.Name, in.Path, in.IsPage, in.IsActive).Scan(&id)
	if err != nil {
		return ModuleResponse{}, err
	}
	if err := applink.SyncCompanyModulesForModule(ctx, tx, id); err != nil {
		return ModuleResponse{}, err
	}
	if err := applink.SyncPrivilegesForModule(ctx, tx, id); err != nil {
		return ModuleResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ModuleResponse{}, err
	}
	return moduleGet(ctx, db, id)
}

func moduleUpdate(ctx context.Context, db *pgxpool.Pool, id string, in ModuleUpdate) (ModuleResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.ParentID != nil {
		argn++
		args = append(args, *in.ParentID)
		sets = append(sets, fmt.Sprintf("parent_id = $%d", argn))
	}
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
	if in.Path != nil {
		argn++
		args = append(args, *in.Path)
		sets = append(sets, fmt.Sprintf("path = $%d", argn))
	}
	if in.IsPage != nil {
		argn++
		args = append(args, *in.IsPage)
		sets = append(sets, fmt.Sprintf("is_page = $%d", argn))
	}
	if in.IsActive != nil {
		argn++
		args = append(args, *in.IsActive)
		sets = append(sets, fmt.Sprintf("is_active = $%d", argn))
	}
	if len(sets) == 0 {
		return moduleGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_module
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return ModuleResponse{}, err
	}
	return moduleGet(ctx, db, id)
}

func moduleDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "DELETE FROM app_user_privilege WHERE module_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_company_module WHERE module_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_module WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
