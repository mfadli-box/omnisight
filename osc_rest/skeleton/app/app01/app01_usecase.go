package app

import (
	"context"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

// pg adalah koneksi pool yang disuntikkan backbone lewat Use.
var pg *pgxpool.Pool

// Use menyuntikkan koneksi database dari backbone.
func Use(p *pgxpool.Pool) {
	pg = p
}

// ListModules mengembalikan halaman module (grid) dengan filter privilege.
func ListModules(ctx context.Context, p mechanic.GridParams) (mechanic.Page[ModuleResponse], error) {
	return moduleList(ctx, pg, p)
}

// GetModule mengembalikan detail module berdasarkan id.
func GetModule(ctx context.Context, id string) (ModuleResponse, error) {
	return moduleGet(ctx, pg, id)
}

// CreateModule menambahkan module baru.
func CreateModule(ctx context.Context, in ModuleCreate) (ModuleResponse, error) {
	return moduleCreate(ctx, pg, in)
}

// UpdateModule mengubah module berdasarkan id (partial update).
func UpdateModule(ctx context.Context, id string, in ModuleUpdate) (ModuleResponse, error) {
	return moduleUpdate(ctx, pg, id, in)
}

// DeleteModule menghapus module berdasarkan id.
func DeleteModule(ctx context.Context, id string) error {
	return moduleDelete(ctx, pg, id)
}
