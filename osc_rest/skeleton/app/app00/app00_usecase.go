package app

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// pg adalah koneksi pool yang disuntikkan backbone lewat Use.
var pg *pgxpool.Pool

// Use menyuntikkan koneksi database dari backbone.
func Use(p *pgxpool.Pool) {
	pg = p
}

// UserCompanyList mengembalikan daftar company aktif milik user.
func UserCompanyList(ctx context.Context, userID string) ([]CompanyItem, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("user not loaded")
	}
	return userCompanies(ctx, pg, userID)
}

// ModuleTree mengembalikan pohon modul per company dengan filter privilege.
func ModuleTree(ctx context.Context, companyID, userID string, isAdmin bool) ([]*ModuleNode, error) {
	if strings.TrimSpace(companyID) == "" {
		return nil, errors.New("company is required")
	}
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("user not loaded")
	}
	rows, err := moduleRows(ctx, pg, companyID, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	return buildModuleTree(rows), nil
}
