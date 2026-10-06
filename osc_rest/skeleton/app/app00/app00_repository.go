package app

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// moduleRow adalah baris mentah dari query modul.
type moduleRow struct {
	ID       string
	ParentID *string
	Code     string
	Name     string
	Path     string
	IsPage   bool
}

// userCompanies mengambil daftar company aktif milik user.
func userCompanies(ctx context.Context, db *pgxpool.Pool, userID string) ([]CompanyItem, error) {
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

// moduleRows mengambil modul aktif per company, di-filter privilege untuk
// user non-admin (level != HIDE). Node parent tetap diikutsertakan agar
// pohon tetap utuh.
func moduleRows(ctx context.Context, db *pgxpool.Pool, companyID, userID string, isAdmin bool) ([]moduleRow, error) {
	var query string
	var args []any
	if isAdmin {
		query = `
			SELECT	m.id, m.parent_id, m.code, m.name, m.path, m.is_page
			FROM	app_module m
			JOIN	app_company_module cm ON cm.module_id = m.id
			WHERE	cm.company_id = $1
			  AND	cm.is_active = true
			  AND	m.is_active = true
			ORDER	BY m.name`
		args = []any{companyID}
	} else {
		query = `
			SELECT	m.id, m.parent_id, m.code, m.name, m.path, m.is_page
			FROM	app_module m
			JOIN	app_company_module cm ON cm.module_id = m.id
			JOIN	app_user_privilege p ON p.module_id = m.id
			JOIN	app_user_company uc ON uc.id = p.user_company_id
			WHERE	cm.company_id = $1
			  AND	cm.is_active = true
			  AND	m.is_active = true
			  AND	uc.user_id = $2
			  AND	uc.company_id = $1
			  AND	uc.is_active = true
			  AND	p.level <> 'HIDE'
			UNION
			SELECT	m.id, m.parent_id, m.code, m.name, m.path, m.is_page
			FROM	app_module m
			WHERE	m.id IN (
				SELECT	DISTINCT parent_id
				FROM	app_module ch
				JOIN	app_company_module cm ON cm.module_id = ch.id
				JOIN	app_user_privilege p ON p.module_id = ch.id
				JOIN	app_user_company uc ON uc.id = p.user_company_id
				WHERE	cm.company_id = $1
				  AND	cm.is_active = true
				  AND	ch.is_active = true
				  AND	uc.user_id = $2
				  AND	uc.company_id = $1
				  AND	uc.is_active = true
				  AND	p.level <> 'HIDE'
			)
			ORDER BY name`
		args = []any{companyID, userID}
	}
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []moduleRow{}
	for rows.Next() {
		var m moduleRow
		if err := rows.Scan(
			&m.ID, &m.ParentID, &m.Code, &m.Name, &m.Path, &m.IsPage,
		); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

// buildModuleTree menyusun pohon modul dari daftar baris.
func buildModuleTree(rows []moduleRow) []*ModuleNode {
	nodeByID := make(map[string]*ModuleNode, len(rows))
	for _, r := range rows {
		nodeByID[r.ID] = &ModuleNode{
			ID:     r.ID,
			Code:   r.Code,
			Name:   r.Name,
			Path:   r.Path,
			IsPage: r.IsPage,
		}
	}
	roots := []*ModuleNode{}
	for _, r := range rows {
		node := nodeByID[r.ID]
		if r.ParentID != nil {
			if parent, ok := nodeByID[*r.ParentID]; ok {
				parent.Children = append(parent.Children, node)
				continue
			}
		}
		roots = append(roots, node)
	}
	return roots
}
