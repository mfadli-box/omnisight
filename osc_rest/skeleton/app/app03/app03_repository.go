package app

import (
	"context"
	"fmt"
	"strings"

	"osc_rest/mechanic"
	"osc_rest/skeleton/app/applink"

	"github.com/jackc/pgx/v5/pgxpool"
)

const userColumns = `
	id, username, email, fullname, phone, company_id, employee_id, location_id,
	department_id, division_id, role, job, key, is_admin, is_hris, is_active,
	created_at::text, updated_at::text`

func userGet(ctx context.Context, db *pgxpool.Pool, id string) (UserResponse, error) {
	var r UserResponse
	err := db.QueryRow(ctx, `
		SELECT	u.id, u.username, u.email, u.fullname, u.phone, u.company_id,
				COALESCE(c.name, ''), u.employee_id, u.location_id,
				u.department_id, u.division_id, u.role, u.job, u.key,
				u.is_admin, u.is_hris, u.is_active, u.created_at::text,
				u.updated_at::text
		FROM	app_user u
		LEFT	JOIN app_company c ON c.id = u.company_id
		WHERE	u.id = $1`, id).Scan(
		&r.ID, &r.Username, &r.Email, &r.Fullname, &r.Phone, &r.CompanyID,
		&r.CompanyName, &r.EmployeeID, &r.LocationID, &r.DepartmentID,
		&r.DivisionID, &r.Role, &r.Job, &r.Key, &r.IsAdmin, &r.IsHris,
		&r.IsActive, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func userList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[UserResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			u.username ILIKE $%d OR
			u.email ILIKE $%d OR
			u.fullname ILIKE $%d OR
			COALESCE(c.name, '') ILIKE $%d
		)`, argn, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_user u
		LEFT	JOIN app_company c ON c.id = u.company_id
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[UserResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"username":     "u.username",
		"email":        "u.email",
		"fullname":     "u.fullname",
		"company_name": "c.name",
		"role":         "u.role",
		"is_active":    "u.is_active",
		"created_at":   "u.created_at",
	}, "u.fullname")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	u.id, u.username, u.email, u.fullname, u.phone, u.company_id,
				COALESCE(c.name, ''), u.employee_id, u.location_id,
				u.department_id, u.division_id, u.role, u.job, u.key,
				u.is_admin, u.is_hris, u.is_active, u.created_at::text,
				u.updated_at::text
		FROM	app_user u
		LEFT	JOIN app_company c ON c.id = u.company_id
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[UserResponse]{}, err
	}
	defer rows.Close()
	list := []UserResponse{}
	for rows.Next() {
		var r UserResponse
		if err := rows.Scan(
			&r.ID, &r.Username, &r.Email, &r.Fullname, &r.Phone, &r.CompanyID,
			&r.CompanyName, &r.EmployeeID, &r.LocationID, &r.DepartmentID,
			&r.DivisionID, &r.Role, &r.Job, &r.Key, &r.IsAdmin, &r.IsHris,
			&r.IsActive, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return mechanic.Page[UserResponse]{}, err
		}
		list = append(list, r)
	}
	return mechanic.Page[UserResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func userCreate(ctx context.Context, db *pgxpool.Pool, in UserCreate, hashed string) (UserResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return UserResponse{}, err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO app_user (
			id, username, email, password, fullname, phone, company_id,
			employee_id, location_id, department_id, division_id, role,
			job, key, is_admin, is_hris, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			$11, $12, $13, $14, $15, $16
		) RETURNING id`,
		in.Username, in.Email, hashed, in.Fullname, in.Phone, in.CompanyID,
		in.EmployeeID, in.LocationID, in.DepartmentID, in.DivisionID, in.Role,
		in.Job, in.Key, in.IsAdmin, in.IsHris, in.IsActive).Scan(&id)
	if err != nil {
		return UserResponse{}, err
	}
	if err := applink.SyncUserCompaniesForUser(ctx, tx, id); err != nil {
		return UserResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return UserResponse{}, err
	}
	return userGet(ctx, db, id)
}

func userUpdate(ctx context.Context, db *pgxpool.Pool, id string, in UserUpdate) (UserResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.Email != nil {
		argn++
		args = append(args, *in.Email)
		sets = append(sets, fmt.Sprintf("email = $%d", argn))
	}
	if in.Password != nil {
		argn++
		args = append(args, *in.Password)
		sets = append(sets, fmt.Sprintf("password = $%d", argn))
	}
	if in.Fullname != nil {
		argn++
		args = append(args, *in.Fullname)
		sets = append(sets, fmt.Sprintf("fullname = $%d", argn))
	}
	if in.Phone != nil {
		argn++
		args = append(args, *in.Phone)
		sets = append(sets, fmt.Sprintf("phone = $%d", argn))
	}
	if in.CompanyID != nil {
		argn++
		args = append(args, *in.CompanyID)
		sets = append(sets, fmt.Sprintf("company_id = $%d", argn))
	}
	if in.EmployeeID != nil {
		argn++
		args = append(args, *in.EmployeeID)
		sets = append(sets, fmt.Sprintf("employee_id = $%d", argn))
	}
	if in.LocationID != nil {
		argn++
		args = append(args, *in.LocationID)
		sets = append(sets, fmt.Sprintf("location_id = $%d", argn))
	}
	if in.DepartmentID != nil {
		argn++
		args = append(args, *in.DepartmentID)
		sets = append(sets, fmt.Sprintf("department_id = $%d", argn))
	}
	if in.DivisionID != nil {
		argn++
		args = append(args, *in.DivisionID)
		sets = append(sets, fmt.Sprintf("division_id = $%d", argn))
	}
	if in.Role != nil {
		argn++
		args = append(args, *in.Role)
		sets = append(sets, fmt.Sprintf("role = $%d", argn))
	}
	if in.Job != nil {
		argn++
		args = append(args, *in.Job)
		sets = append(sets, fmt.Sprintf("job = $%d", argn))
	}
	if in.Key != nil {
		argn++
		args = append(args, *in.Key)
		sets = append(sets, fmt.Sprintf("key = $%d", argn))
	}
	if in.IsAdmin != nil {
		argn++
		args = append(args, *in.IsAdmin)
		sets = append(sets, fmt.Sprintf("is_admin = $%d", argn))
	}
	if in.IsHris != nil {
		argn++
		args = append(args, *in.IsHris)
		sets = append(sets, fmt.Sprintf("is_hris = $%d", argn))
	}
	if in.IsActive != nil {
		argn++
		args = append(args, *in.IsActive)
		sets = append(sets, fmt.Sprintf("is_active = $%d", argn))
	}
	if len(sets) == 0 {
		return userGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_user
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return UserResponse{}, err
	}
	return userGet(ctx, db, id)
}

func userDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		DELETE FROM app_user_privilege
		WHERE user_company_id IN (SELECT id FROM app_user_company WHERE user_id = $1)`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_user_company WHERE user_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_user WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func userCompanyList(ctx context.Context, db *pgxpool.Pool, userID string) ([]UserCompanyResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	uc.id, uc.user_id, uc.company_id, c.code, c.name, uc.is_active,
				uc.created_at::text
		FROM	app_user_company uc
		JOIN	app_company c ON c.id = uc.company_id
		WHERE	uc.user_id = $1
		ORDER	BY c.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []UserCompanyResponse{}
	for rows.Next() {
		var r UserCompanyResponse
		if err := rows.Scan(&r.ID, &r.UserID, &r.CompanyID, &r.CompanyCode,
			&r.CompanyName, &r.IsActive, &r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func userCompanyGet(ctx context.Context, db *pgxpool.Pool, id string) (UserCompanyResponse, error) {
	var r UserCompanyResponse
	err := db.QueryRow(ctx, `
		SELECT	uc.id, uc.user_id, uc.company_id, c.code, c.name, uc.is_active,
				uc.created_at::text
		FROM	app_user_company uc
		JOIN	app_company c ON c.id = uc.company_id
		WHERE	uc.id = $1`, id).Scan(
		&r.ID, &r.UserID, &r.CompanyID, &r.CompanyCode, &r.CompanyName,
		&r.IsActive, &r.CreatedAt)
	return r, err
}

func userCompanyCreate(ctx context.Context, db *pgxpool.Pool, userID string, in UserCompanyCreate) (UserCompanyResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return UserCompanyResponse{}, err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO app_user_company (
			id, user_id, company_id, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3
		) RETURNING id`,
		userID, in.CompanyID, in.IsActive).Scan(&id)
	if err != nil {
		return UserCompanyResponse{}, err
	}
	if err := applink.SyncPrivilegesForUserCompany(ctx, tx, id); err != nil {
		return UserCompanyResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return UserCompanyResponse{}, err
	}
	return userCompanyGet(ctx, db, id)
}

func userCompanyUpdate(ctx context.Context, db *pgxpool.Pool, id string, in UserCompanyUpdate) (UserCompanyResponse, error) {
	if in.IsActive == nil {
		return userCompanyGet(ctx, db, id)
	}
	_, err := db.Exec(ctx, `
		UPDATE	app_user_company
		SET		is_active = $1, updated_at = now()
		WHERE	id = $2`, *in.IsActive, id)
	if err != nil {
		return UserCompanyResponse{}, err
	}
	return userCompanyGet(ctx, db, id)
}

func userCompanyDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "DELETE FROM app_user_privilege WHERE user_company_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM app_user_company WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func userPrivilegeList(ctx context.Context, db *pgxpool.Pool, userCompanyID string) ([]UserPrivilegeResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	up.id, up.user_company_id, up.module_id, m.code, m.name,
				up.level, up.created_at::text
		FROM	app_user_privilege up
		JOIN	app_module m ON m.id = up.module_id
		WHERE	up.user_company_id = $1
		ORDER	BY m.name`, userCompanyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []UserPrivilegeResponse{}
	for rows.Next() {
		var r UserPrivilegeResponse
		if err := rows.Scan(&r.ID, &r.UserCompanyID, &r.ModuleID,
			&r.ModuleCode, &r.ModuleName, &r.Level, &r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func userPrivilegeGet(ctx context.Context, db *pgxpool.Pool, id string) (UserPrivilegeResponse, error) {
	var r UserPrivilegeResponse
	err := db.QueryRow(ctx, `
		SELECT	up.id, up.user_company_id, up.module_id, m.code, m.name,
				up.level, up.created_at::text
		FROM	app_user_privilege up
		JOIN	app_module m ON m.id = up.module_id
		WHERE	up.id = $1`, id).Scan(
		&r.ID, &r.UserCompanyID, &r.ModuleID, &r.ModuleCode, &r.ModuleName,
		&r.Level, &r.CreatedAt)
	return r, err
}

func userPrivilegeCreate(ctx context.Context, db *pgxpool.Pool, userCompanyID string, in UserPrivilegeCreate) (UserPrivilegeResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_user_privilege (
			id, user_company_id, module_id, level
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3
		) RETURNING id`,
		userCompanyID, in.ModuleID, in.Level).Scan(&id)
	if err != nil {
		return UserPrivilegeResponse{}, err
	}
	return userPrivilegeGet(ctx, db, id)
}

func userPrivilegeUpdate(ctx context.Context, db *pgxpool.Pool, id string, in UserPrivilegeUpdate) (UserPrivilegeResponse, error) {
	if in.Level == nil {
		return userPrivilegeGet(ctx, db, id)
	}
	_, err := db.Exec(ctx, `
		UPDATE	app_user_privilege
		SET		level = $1, updated_at = now()
		WHERE	id = $2`, *in.Level, id)
	if err != nil {
		return UserPrivilegeResponse{}, err
	}
	return userPrivilegeGet(ctx, db, id)
}

func userPrivilegeDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_user_privilege WHERE id = $1", id)
	return err
}

func userAreaList(ctx context.Context, db *pgxpool.Pool, userID string) ([]UserAreaResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	ua.id, ua.user_id, ua.company_area_id, a.code, a.name,
				COALESCE(c.name, ''), ua.is_active, ua.created_at::text
		FROM	app_user_area ua
		JOIN	app_company_area a ON a.id = ua.company_area_id
		LEFT	JOIN app_company c ON c.id = a.company_id
		WHERE	ua.user_id = $1
		ORDER	BY a.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []UserAreaResponse{}
	for rows.Next() {
		var r UserAreaResponse
		if err := rows.Scan(&r.ID, &r.UserID, &r.CompanyAreaID, &r.AreaCode,
			&r.AreaName, &r.CompanyName, &r.IsActive, &r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func userAreaGet(ctx context.Context, db *pgxpool.Pool, id string) (UserAreaResponse, error) {
	var r UserAreaResponse
	err := db.QueryRow(ctx, `
		SELECT	ua.id, ua.user_id, ua.company_area_id, a.code, a.name,
				COALESCE(c.name, ''), ua.is_active, ua.created_at::text
		FROM	app_user_area ua
		JOIN	app_company_area a ON a.id = ua.company_area_id
		LEFT	JOIN app_company c ON c.id = a.company_id
		WHERE	ua.id = $1`, id).Scan(
		&r.ID, &r.UserID, &r.CompanyAreaID, &r.AreaCode, &r.AreaName,
		&r.CompanyName, &r.IsActive, &r.CreatedAt)
	return r, err
}

func userAreaCreate(ctx context.Context, db *pgxpool.Pool, userID string, in UserAreaCreate) (UserAreaResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_user_area (
			id, user_id, company_area_id, is_active
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3
		) RETURNING id`,
		userID, in.CompanyAreaID, in.IsActive).Scan(&id)
	if err != nil {
		return UserAreaResponse{}, err
	}
	return userAreaGet(ctx, db, id)
}

func userAreaUpdate(ctx context.Context, db *pgxpool.Pool, id string, in UserAreaUpdate) (UserAreaResponse, error) {
	if in.IsActive == nil {
		return userAreaGet(ctx, db, id)
	}
	_, err := db.Exec(ctx, `
		UPDATE	app_user_area
		SET		is_active = $1
		WHERE	id = $2`, *in.IsActive, id)
	if err != nil {
		return UserAreaResponse{}, err
	}
	return userAreaGet(ctx, db, id)
}

func userAreaDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_user_area WHERE id = $1", id)
	return err
}
