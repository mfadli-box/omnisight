package app

import (
	"context"
	"errors"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// pg adalah koneksi pool yang disuntikkan backbone lewat Use.
var pg *pgxpool.Pool

// Use menyuntikkan koneksi database dari backbone.
func Use(p *pgxpool.Pool) {
	pg = p
}

// ListUsers mengembalikan halaman user (grid) dengan filter.
func ListUsers(ctx context.Context, p mechanic.GridParams) (mechanic.Page[UserResponse], error) {
	return userList(ctx, pg, p)
}

// GetUser mengembalikan detail user berdasarkan id.
func GetUser(ctx context.Context, id string) (UserResponse, error) {
	return userGet(ctx, pg, id)
}

// CreateUser menambahkan user baru dengan password yang di-hash bcrypt.
func CreateUser(ctx context.Context, in UserCreate) (UserResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return UserResponse{}, err
	}
	return userCreate(ctx, pg, in, string(hash))
}

// UpdateUser mengubah user berdasarkan id (partial update).
func UpdateUser(ctx context.Context, id string, in UserUpdate) (UserResponse, error) {
	if in.Password != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(*in.Password), bcrypt.DefaultCost)
		if err != nil {
			return UserResponse{}, err
		}
		hashed := string(hash)
		in.Password = &hashed
	}
	return userUpdate(ctx, pg, id, in)
}

// DeleteUser menghapus user berdasarkan id.
func DeleteUser(ctx context.Context, id string) error {
	return userDelete(ctx, pg, id)
}

// ListUserCompanies mengembalikan daftar company milik user (pivot).
func ListUserCompanies(ctx context.Context, userID string) ([]UserCompanyResponse, error) {
	return userCompanyList(ctx, pg, userID)
}

// CreateUserCompany menambahkan company ke user (pivot).
func CreateUserCompany(ctx context.Context, userID string, in UserCompanyCreate) (UserCompanyResponse, error) {
	return userCompanyCreate(ctx, pg, userID, in)
}

// UpdateUserCompany mengubah status pivot company user.
func UpdateUserCompany(ctx context.Context, id string, in UserCompanyUpdate) (UserCompanyResponse, error) {
	return userCompanyUpdate(ctx, pg, id, in)
}

// DeleteUserCompany menghapus pivot company dari user.
func DeleteUserCompany(ctx context.Context, id string) error {
	return userCompanyDelete(ctx, pg, id)
}

// ListUserPrivileges mengembalikan daftar privilege user pada sebuah company pivot.
func ListUserPrivileges(ctx context.Context, userCompanyID string) ([]UserPrivilegeResponse, error) {
	return userPrivilegeList(ctx, pg, userCompanyID)
}

// CreateUserPrivilege menambahkan privilege modul untuk user pada company pivot.
func CreateUserPrivilege(ctx context.Context, userCompanyID string, in UserPrivilegeCreate) (UserPrivilegeResponse, error) {
	if in.Level == "" {
		in.Level = "HIDE"
	}
	if !PrivilegeLevels[in.Level] {
		return UserPrivilegeResponse{}, errors.New("invalid privilege level")
	}
	return userPrivilegeCreate(ctx, pg, userCompanyID, in)
}

// UpdateUserPrivilege mengubah level privilege user pada company pivot.
func UpdateUserPrivilege(ctx context.Context, id string, in UserPrivilegeUpdate) (UserPrivilegeResponse, error) {
	if in.Level != nil && !PrivilegeLevels[*in.Level] {
		return UserPrivilegeResponse{}, errors.New("invalid privilege level")
	}
	return userPrivilegeUpdate(ctx, pg, id, in)
}

// DeleteUserPrivilege menghapus privilege user pada company pivot.
func DeleteUserPrivilege(ctx context.Context, id string) error {
	return userPrivilegeDelete(ctx, pg, id)
}

// ListUserAreas mengembalikan daftar area milik user (pivot).
func ListUserAreas(ctx context.Context, userID string) ([]UserAreaResponse, error) {
	return userAreaList(ctx, pg, userID)
}

// CreateUserArea menambahkan area ke user (pivot).
func CreateUserArea(ctx context.Context, userID string, in UserAreaCreate) (UserAreaResponse, error) {
	return userAreaCreate(ctx, pg, userID, in)
}

// UpdateUserArea mengubah status pivot area user.
func UpdateUserArea(ctx context.Context, id string, in UserAreaUpdate) (UserAreaResponse, error) {
	return userAreaUpdate(ctx, pg, id, in)
}

// DeleteUserArea menghapus pivot area dari user.
func DeleteUserArea(ctx context.Context, id string) error {
	return userAreaDelete(ctx, pg, id)
}
