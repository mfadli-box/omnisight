package app

import (
	"context"
	"errors"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

// pg adalah koneksi pool yang disuntikkan backbone lewat Use.
var pg *pgxpool.Pool

// Use menyuntikkan koneksi database dari backbone.
func Use(p *pgxpool.Pool) {
	pg = p
}

// --- Signature Type ---

// ListSignatureTypes mengembalikan halaman jenis tanda tangan (grid).
func ListSignatureTypes(ctx context.Context, p mechanic.GridParams) (mechanic.Page[SignatureTypeResponse], error) {
	return signatureTypeList(ctx, pg, p)
}

// GetSignatureType mengembalikan detail jenis tanda tangan.
func GetSignatureType(ctx context.Context, id string) (SignatureTypeResponse, error) {
	return signatureTypeGet(ctx, pg, id)
}

// CreateSignatureType menambahkan jenis tanda tangan baru.
func CreateSignatureType(ctx context.Context, in SignatureTypeCreate) (SignatureTypeResponse, error) {
	return signatureTypeCreate(ctx, pg, in)
}

// UpdateSignatureType mengubah jenis tanda tangan (partial update).
func UpdateSignatureType(ctx context.Context, id string, in SignatureTypeUpdate) (SignatureTypeResponse, error) {
	return signatureTypeUpdate(ctx, pg, id, in)
}

// DeleteSignatureType menghapus jenis tanda tangan (berantai ke steps).
func DeleteSignatureType(ctx context.Context, id string) error {
	return signatureTypeDelete(ctx, pg, id)
}

// --- Approval Step ---

// ListApprovalSteps mengembalikan daftar langkah persetujuan per jenis.
func ListApprovalSteps(ctx context.Context, typeID string) ([]ApprovalStepResponse, error) {
	return approvalStepList(ctx, pg, typeID)
}

// GetApprovalStep mengembalikan detail langkah persetujuan.
func GetApprovalStep(ctx context.Context, id string) (ApprovalStepResponse, error) {
	return approvalStepGet(ctx, pg, id)
}

// CreateApprovalStep menambahkan langkah persetujuan pada jenis.
func CreateApprovalStep(ctx context.Context, typeID string, in ApprovalStepCreate) (ApprovalStepResponse, error) {
	if in.Condition == "" {
		in.Condition = "ANY_APPROVED"
	}
	if !SignatureConditions[in.Condition] {
		return ApprovalStepResponse{}, errors.New("invalid condition")
	}
	return approvalStepCreate(ctx, pg, typeID, in)
}

// UpdateApprovalStep mengubah langkah persetujuan.
func UpdateApprovalStep(ctx context.Context, id string, in ApprovalStepUpdate) (ApprovalStepResponse, error) {
	if in.Condition != nil && !SignatureConditions[*in.Condition] {
		return ApprovalStepResponse{}, errors.New("invalid condition")
	}
	return approvalStepUpdate(ctx, pg, id, in)
}

// DeleteApprovalStep menghapus langkah persetujuan (berantai ke signers).
func DeleteApprovalStep(ctx context.Context, id string) error {
	return approvalStepDelete(ctx, pg, id)
}

// --- Approval Sign ---

// ListApprovalSigns mengembalikan daftar signer pada sebuah langkah.
func ListApprovalSigns(ctx context.Context, stepID string) ([]ApprovalSignResponse, error) {
	return approvalSignList(ctx, pg, stepID)
}

// CreateApprovalSign menambahkan signer pada langkah.
func CreateApprovalSign(ctx context.Context, stepID string, in ApprovalSignCreate) (ApprovalSignResponse, error) {
	return approvalSignCreate(ctx, pg, stepID, in)
}

// UpdateApprovalSign mengubah signer pada langkah.
func UpdateApprovalSign(ctx context.Context, id string, in ApprovalSignUpdate) (ApprovalSignResponse, error) {
	return approvalSignUpdate(ctx, pg, id, in)
}

// DeleteApprovalSign menghapus signer dari langkah.
func DeleteApprovalSign(ctx context.Context, id string) error {
	return approvalSignDelete(ctx, pg, id)
}

// --- Signature Form ---

// ListSignatureForms mengembalikan halaman form pengajuan (grid).
func ListSignatureForms(ctx context.Context, p mechanic.GridParams) (mechanic.Page[SignatureFormResponse], error) {
	return signatureFormList(ctx, pg, p)
}

// GetSignatureForm mengembalikan detail form pengajuan.
func GetSignatureForm(ctx context.Context, id string) (SignatureFormResponse, error) {
	return signatureFormGet(ctx, pg, id)
}

// CreateSignatureForm menambahkan form pengajuan baru.
func CreateSignatureForm(ctx context.Context, in SignatureFormCreate) (SignatureFormResponse, error) {
	if in.Condition == "" {
		in.Condition = "ANY_APPROVED"
	}
	if in.Status == "" {
		in.Status = "PENDING"
	}
	if !SignatureConditions[in.Condition] {
		return SignatureFormResponse{}, errors.New("invalid condition")
	}
	if !SignatureStatuses[in.Status] {
		return SignatureFormResponse{}, errors.New("invalid status")
	}
	return signatureFormCreate(ctx, pg, in)
}

// UpdateSignatureForm mengubah form pengajuan (partial update).
func UpdateSignatureForm(ctx context.Context, id string, in SignatureFormUpdate) (SignatureFormResponse, error) {
	if in.Condition != nil && !SignatureConditions[*in.Condition] {
		return SignatureFormResponse{}, errors.New("invalid condition")
	}
	if in.Status != nil && !SignatureStatuses[*in.Status] {
		return SignatureFormResponse{}, errors.New("invalid status")
	}
	return signatureFormUpdate(ctx, pg, id, in)
}

// DeleteSignatureForm menghapus form pengajuan (berantai ke flags).
func DeleteSignatureForm(ctx context.Context, id string) error {
	return signatureFormDelete(ctx, pg, id)
}

// --- Signature Flag ---

// ListSignatureFlags mengembalikan daftar flag signer pada form.
func ListSignatureFlags(ctx context.Context, formID string) ([]SignatureFlagResponse, error) {
	return signatureFlagList(ctx, pg, formID)
}

// CreateSignatureFlag menambahkan flag signer pada form.
func CreateSignatureFlag(ctx context.Context, formID string, in SignatureFlagCreate) (SignatureFlagResponse, error) {
	if in.Status == "" {
		in.Status = "PENDING"
	}
	if !SignatureStatuses[in.Status] {
		return SignatureFlagResponse{}, errors.New("invalid status")
	}
	return signatureFlagCreate(ctx, pg, formID, in)
}

// UpdateSignatureFlag mengubah flag signer pada form.
func UpdateSignatureFlag(ctx context.Context, id string, in SignatureFlagUpdate) (SignatureFlagResponse, error) {
	if in.Status != nil && !SignatureStatuses[*in.Status] {
		return SignatureFlagResponse{}, errors.New("invalid status")
	}
	return signatureFlagUpdate(ctx, pg, id, in)
}

// DeleteSignatureFlag menghapus flag signer dari form.
func DeleteSignatureFlag(ctx context.Context, id string) error {
	return signatureFlagDelete(ctx, pg, id)
}
