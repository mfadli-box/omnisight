package app

import (
	"context"
	"fmt"
	"strings"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

// --- Signature Type ---

const signatureTypeColumns = `id, code, name, created_at::text, updated_at::text`

func signatureTypeGet(ctx context.Context, db *pgxpool.Pool, id string) (SignatureTypeResponse, error) {
	var r SignatureTypeResponse
	err := db.QueryRow(ctx, `
		SELECT	`+signatureTypeColumns+`
		FROM	app_signature_type
		WHERE	id = $1`, id).Scan(
		&r.ID, &r.Code, &r.Name, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func signatureTypeList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[SignatureTypeResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (code ILIKE $%d OR name ILIKE $%d)`, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_signature_type
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[SignatureTypeResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"code":       "code",
		"name":       "name",
		"created_at": "created_at",
	}, "code")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	q := `
		SELECT	` + signatureTypeColumns + `
		FROM	app_signature_type
	` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return mechanic.Page[SignatureTypeResponse]{}, err
	}
	defer rows.Close()
	list := []SignatureTypeResponse{}
	for rows.Next() {
		var r SignatureTypeResponse
		if err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return mechanic.Page[SignatureTypeResponse]{}, err
		}
		list = append(list, r)
	}
	return mechanic.Page[SignatureTypeResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func signatureTypeCreate(ctx context.Context, db *pgxpool.Pool, in SignatureTypeCreate) (SignatureTypeResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_signature_type (id, code, name)
		VALUES (gen_random_uuid()::text, $1, $2)
		RETURNING id`, in.Code, in.Name).Scan(&id)
	if err != nil {
		return SignatureTypeResponse{}, err
	}
	return signatureTypeGet(ctx, db, id)
}

func signatureTypeUpdate(ctx context.Context, db *pgxpool.Pool, id string, in SignatureTypeUpdate) (SignatureTypeResponse, error) {
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
	if len(sets) == 0 {
		return signatureTypeGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_signature_type
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return SignatureTypeResponse{}, err
	}
	return signatureTypeGet(ctx, db, id)
}

func signatureTypeDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_signature_type WHERE id = $1", id)
	return err
}

// --- Approval Step ---

func approvalStepGet(ctx context.Context, db *pgxpool.Pool, id string) (ApprovalStepResponse, error) {
	var r ApprovalStepResponse
	err := db.QueryRow(ctx, `
		SELECT	ast.id, ast.type_id, st.code, st.name, ast.step, ast.condition
		FROM	app_approval_step ast
		JOIN	app_signature_type st ON st.id = ast.type_id
		WHERE	ast.id = $1`, id).Scan(
		&r.ID, &r.TypeID, &r.SignatureTypeCode, &r.SignatureTypeName, &r.Step, &r.Condition)
	return r, err
}

func approvalStepList(ctx context.Context, db *pgxpool.Pool, typeID string) ([]ApprovalStepResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	ast.id, ast.type_id, st.code, st.name, ast.step, ast.condition
		FROM	app_approval_step ast
		JOIN	app_signature_type st ON st.id = ast.type_id
		WHERE	ast.type_id = $1
		ORDER	BY ast.step`, typeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []ApprovalStepResponse{}
	for rows.Next() {
		var r ApprovalStepResponse
		if err := rows.Scan(&r.ID, &r.TypeID, &r.SignatureTypeCode, &r.SignatureTypeName, &r.Step, &r.Condition); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func approvalStepCreate(ctx context.Context, db *pgxpool.Pool, typeID string, in ApprovalStepCreate) (ApprovalStepResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_approval_step (id, type_id, step, condition)
		VALUES (gen_random_uuid()::text, $1, $2, $3)
		RETURNING id`, typeID, in.Step, in.Condition).Scan(&id)
	if err != nil {
		return ApprovalStepResponse{}, err
	}
	return approvalStepGet(ctx, db, id)
}

func approvalStepUpdate(ctx context.Context, db *pgxpool.Pool, id string, in ApprovalStepUpdate) (ApprovalStepResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.Step != nil {
		argn++
		args = append(args, *in.Step)
		sets = append(sets, fmt.Sprintf("step = $%d", argn))
	}
	if in.Condition != nil {
		argn++
		args = append(args, *in.Condition)
		sets = append(sets, fmt.Sprintf("condition = $%d", argn))
	}
	if len(sets) == 0 {
		return approvalStepGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_approval_step
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return ApprovalStepResponse{}, err
	}
	return approvalStepGet(ctx, db, id)
}

func approvalStepDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_approval_step WHERE id = $1", id)
	return err
}

// --- Approval Sign ---

func approvalSignGet(ctx context.Context, db *pgxpool.Pool, id string) (ApprovalSignResponse, error) {
	var r ApprovalSignResponse
	err := db.QueryRow(ctx, `
		SELECT	asg.id, asg.step_id, asg.user_id, u.username, u.fullname
		FROM	app_approval_sign asg
		JOIN	app_user u ON u.id = asg.user_id
		WHERE	asg.id = $1`, id).Scan(
		&r.ID, &r.StepID, &r.UserID, &r.Username, &r.Fullname)
	return r, err
}

func approvalSignList(ctx context.Context, db *pgxpool.Pool, stepID string) ([]ApprovalSignResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	asg.id, asg.step_id, asg.user_id, u.username, u.fullname
		FROM	app_approval_sign asg
		JOIN	app_user u ON u.id = asg.user_id
		WHERE	asg.step_id = $1
		ORDER	BY u.fullname`, stepID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []ApprovalSignResponse{}
	for rows.Next() {
		var r ApprovalSignResponse
		if err := rows.Scan(&r.ID, &r.StepID, &r.UserID, &r.Username, &r.Fullname); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func approvalSignCreate(ctx context.Context, db *pgxpool.Pool, stepID string, in ApprovalSignCreate) (ApprovalSignResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_approval_sign (id, step_id, user_id)
		VALUES (gen_random_uuid()::text, $1, $2)
		RETURNING id`, stepID, in.UserID).Scan(&id)
	if err != nil {
		return ApprovalSignResponse{}, err
	}
	return approvalSignGet(ctx, db, id)
}

func approvalSignUpdate(ctx context.Context, db *pgxpool.Pool, id string, in ApprovalSignUpdate) (ApprovalSignResponse, error) {
	if in.UserID == nil {
		return approvalSignGet(ctx, db, id)
	}
	_, err := db.Exec(ctx, `
		UPDATE	app_approval_sign
		SET		user_id = $1
		WHERE	id = $2`, *in.UserID, id)
	if err != nil {
		return ApprovalSignResponse{}, err
	}
	return approvalSignGet(ctx, db, id)
}

func approvalSignDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_approval_sign WHERE id = $1", id)
	return err
}

// --- Signature Form ---

const signatureFormColumns = `
	id, signature_type_id, st.code, st.name, step, request_id, condition,
	status, created_at::text, updated_at::text`

func signatureFormGet(ctx context.Context, db *pgxpool.Pool, id string) (SignatureFormResponse, error) {
	var r SignatureFormResponse
	var typeID *string
	err := db.QueryRow(ctx, `
		SELECT	sf.id, sf.signature_type_id, COALESCE(st.code, ''), COALESCE(st.name, ''),
				sf.step, sf.request_id, sf.condition, sf.status,
				sf.created_at::text, sf.updated_at::text
		FROM	app_signature_form sf
		LEFT	JOIN app_signature_type st ON st.id = sf.signature_type_id
		WHERE	sf.id = $1`, id).Scan(
		&r.ID, &typeID, &r.SignatureTypeCode, &r.SignatureTypeName, &r.Step,
		&r.RequestID, &r.Condition, &r.Status, &r.CreatedAt, &r.UpdatedAt)
	r.SignatureTypeID = typeID
	return r, err
}

func signatureFormList(ctx context.Context, db *pgxpool.Pool, p mechanic.GridParams) (mechanic.Page[SignatureFormResponse], error) {
	p.Default()
	where := ` WHERE 1=1`
	args := []any{}
	argn := 0
	if p.Search != "" {
		argn++
		args = append(args, mechanic.Like(p.Search))
		where += fmt.Sprintf(` AND (
			sf.request_id ILIKE $%d OR
			sf.status ILIKE $%d OR
			COALESCE(st.code, '') ILIKE $%d OR
			COALESCE(st.name, '') ILIKE $%d
		)`, argn, argn, argn, argn)
	}
	var total int64
	if err := db.QueryRow(ctx, `
		SELECT	count(*)
		FROM	app_signature_form sf
		LEFT	JOIN app_signature_type st ON st.id = sf.signature_type_id
	`+where, args...).Scan(&total); err != nil {
		return mechanic.Page[SignatureFormResponse]{}, err
	}
	limit, offset := mechanic.LimitOffset(p)
	order := mechanic.OrderClause(p.Sort, p.Order, map[string]string{
		"request_id": "sf.request_id",
		"status":     "sf.status",
		"step":       "sf.step",
		"type_code":  "st.code",
		"type_name":  "st.name",
		"created_at": "sf.created_at",
	}, "sf.created_at")
	argn++
	limitArg := argn
	argn++
	offsetArg := argn
	rows, err := db.Query(ctx, `
		SELECT	sf.id, sf.signature_type_id, COALESCE(st.code, ''), COALESCE(st.name, ''),
				sf.step, sf.request_id, sf.condition, sf.status,
				sf.created_at::text, sf.updated_at::text
		FROM	app_signature_form sf
		LEFT	JOIN app_signature_type st ON st.id = sf.signature_type_id
	`+where+order+fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg),
		append(args, limit, offset)...)
	if err != nil {
		return mechanic.Page[SignatureFormResponse]{}, err
	}
	defer rows.Close()
	list := []SignatureFormResponse{}
	for rows.Next() {
		var r SignatureFormResponse
		var typeID *string
		if err := rows.Scan(&r.ID, &typeID, &r.SignatureTypeCode, &r.SignatureTypeName,
			&r.Step, &r.RequestID, &r.Condition, &r.Status, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return mechanic.Page[SignatureFormResponse]{}, err
		}
		r.SignatureTypeID = typeID
		list = append(list, r)
	}
	return mechanic.Page[SignatureFormResponse]{
		Rows:      list,
		Total:     total,
		Page:      p.Page,
		PageSize:  p.PageSize,
		TotalPage: mechanic.TotalPage(total, p.PageSize)}, nil
}

func signatureFormCreate(ctx context.Context, db *pgxpool.Pool, in SignatureFormCreate) (SignatureFormResponse, error) {
	var id string
	var typeID *string
	err := db.QueryRow(ctx, `
		INSERT INTO app_signature_form (
			id, signature_type_id, step, request_id, condition, status
		) VALUES (
			gen_random_uuid()::text, $1, $2, $3, $4, $5
		) RETURNING id, signature_type_id`,
		nullableString(in.SignatureTypeID), in.Step, in.RequestID, in.Condition, in.Status).
		Scan(&id, &typeID)
	if err != nil {
		return SignatureFormResponse{}, err
	}
	return signatureFormGet(ctx, db, id)
}

func signatureFormUpdate(ctx context.Context, db *pgxpool.Pool, id string, in SignatureFormUpdate) (SignatureFormResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.SignatureTypeID != nil {
		argn++
		args = append(args, nullableString(*in.SignatureTypeID))
		sets = append(sets, fmt.Sprintf("signature_type_id = $%d", argn))
	}
	if in.Step != nil {
		argn++
		args = append(args, *in.Step)
		sets = append(sets, fmt.Sprintf("step = $%d", argn))
	}
	if in.RequestID != nil {
		argn++
		args = append(args, *in.RequestID)
		sets = append(sets, fmt.Sprintf("request_id = $%d", argn))
	}
	if in.Condition != nil {
		argn++
		args = append(args, *in.Condition)
		sets = append(sets, fmt.Sprintf("condition = $%d", argn))
	}
	if in.Status != nil {
		argn++
		args = append(args, *in.Status)
		sets = append(sets, fmt.Sprintf("status = $%d", argn))
	}
	if len(sets) == 0 {
		return signatureFormGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_signature_form
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return SignatureFormResponse{}, err
	}
	return signatureFormGet(ctx, db, id)
}

func signatureFormDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_signature_form WHERE id = $1", id)
	return err
}

// --- Signature Flag ---

func signatureFlagGet(ctx context.Context, db *pgxpool.Pool, id string) (SignatureFlagResponse, error) {
	var r SignatureFlagResponse
	err := db.QueryRow(ctx, `
		SELECT	sfg.id, sfg.form_id, sfg.user_id, u.username, u.fullname,
				sfg.status, sfg.comment, sfg.created_at::text, sfg.updated_at::text
		FROM	app_signature_flag sfg
		JOIN	app_user u ON u.id = sfg.user_id
		WHERE	sfg.id = $1`, id).Scan(
		&r.ID, &r.FormID, &r.UserID, &r.Username, &r.Fullname,
		&r.Status, &r.Comment, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func signatureFlagList(ctx context.Context, db *pgxpool.Pool, formID string) ([]SignatureFlagResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT	sfg.id, sfg.form_id, sfg.user_id, u.username, u.fullname,
				sfg.status, sfg.comment, sfg.created_at::text, sfg.updated_at::text
		FROM	app_signature_flag sfg
		JOIN	app_user u ON u.id = sfg.user_id
		WHERE	sfg.form_id = $1
		ORDER	BY u.fullname`, formID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []SignatureFlagResponse{}
	for rows.Next() {
		var r SignatureFlagResponse
		if err := rows.Scan(&r.ID, &r.FormID, &r.UserID, &r.Username, &r.Fullname,
			&r.Status, &r.Comment, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func signatureFlagCreate(ctx context.Context, db *pgxpool.Pool, formID string, in SignatureFlagCreate) (SignatureFlagResponse, error) {
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO app_signature_flag (id, form_id, user_id, status, comment)
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
		RETURNING id`,
		formID, in.UserID, in.Status, in.Comment).Scan(&id)
	if err != nil {
		return SignatureFlagResponse{}, err
	}
	return signatureFlagGet(ctx, db, id)
}

func signatureFlagUpdate(ctx context.Context, db *pgxpool.Pool, id string, in SignatureFlagUpdate) (SignatureFlagResponse, error) {
	sets := []string{}
	args := []any{}
	argn := 0
	if in.Status != nil {
		argn++
		args = append(args, *in.Status)
		sets = append(sets, fmt.Sprintf("status = $%d", argn))
	}
	if in.Comment != nil {
		argn++
		args = append(args, *in.Comment)
		sets = append(sets, fmt.Sprintf("comment = $%d", argn))
	}
	if len(sets) == 0 {
		return signatureFlagGet(ctx, db, id)
	}
	argn++
	args = append(args, id)
	q := `
		UPDATE	app_signature_flag
		SET		` + strings.Join(sets, `, `) + fmt.Sprintf(`, updated_at = now()
		WHERE	id = $%d
	`, argn)
	_, err := db.Exec(ctx, q, args...)
	if err != nil {
		return SignatureFlagResponse{}, err
	}
	return signatureFlagGet(ctx, db, id)
}

func signatureFlagDelete(ctx context.Context, db *pgxpool.Pool, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM app_signature_flag WHERE id = $1", id)
	return err
}

// --- helpers ---

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
