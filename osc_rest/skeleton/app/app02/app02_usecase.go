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

func ListCompanies(ctx context.Context, p mechanic.GridParams) (mechanic.Page[CompanyResponse], error) {
	return companyList(ctx, pg, p)
}

func GetCompany(ctx context.Context, id string) (CompanyResponse, error) {
	return companyGet(ctx, pg, id)
}

func CreateCompany(ctx context.Context, in CompanyCreate) (CompanyResponse, error) {
	return companyCreate(ctx, pg, in)
}

func UpdateCompany(ctx context.Context, id string, in CompanyUpdate) (CompanyResponse, error) {
	return companyUpdate(ctx, pg, id, in)
}

func DeleteCompany(ctx context.Context, id string) error {
	return companyDelete(ctx, pg, id)
}

func ListCompanyModules(ctx context.Context, companyID string) ([]CompanyModuleResponse, error) {
	return companyModuleList(ctx, pg, companyID)
}

func CreateCompanyModule(ctx context.Context, companyID string, in CompanyModuleCreate) (CompanyModuleResponse, error) {
	return companyModuleCreate(ctx, pg, companyID, in)
}

func UpdateCompanyModule(ctx context.Context, id string, in CompanyModuleUpdate) (CompanyModuleResponse, error) {
	return companyModuleUpdate(ctx, pg, id, in)
}

func DeleteCompanyModule(ctx context.Context, id string) error {
	return companyModuleDelete(ctx, pg, id)
}

func ListCompanyAreas(ctx context.Context, companyID string) ([]CompanyAreaResponse, error) {
	return companyAreaList(ctx, pg, companyID)
}

func CreateCompanyArea(ctx context.Context, companyID string, in CompanyAreaCreate) (CompanyAreaResponse, error) {
	return companyAreaCreate(ctx, pg, companyID, in)
}

func UpdateCompanyArea(ctx context.Context, id string, in CompanyAreaUpdate) (CompanyAreaResponse, error) {
	return companyAreaUpdate(ctx, pg, id, in)
}

func DeleteCompanyArea(ctx context.Context, id string) error {
	return companyAreaDelete(ctx, pg, id)
}
