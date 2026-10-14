package app

// --- Signature Type ---

type SignatureTypeCreate struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type SignatureTypeUpdate struct {
	Code *string `json:"code,omitempty"`
	Name *string `json:"name,omitempty"`
}

type SignatureTypeResponse struct {
	ID        string `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// --- Approval Step (per signature type) ---

type ApprovalStepCreate struct {
	Step      int    `json:"step"`
	Condition string `json:"condition"`
}

type ApprovalStepUpdate struct {
	Step      *int    `json:"step,omitempty"`
	Condition *string `json:"condition,omitempty"`
}

type ApprovalStepResponse struct {
	ID                string `json:"id"`
	TypeID            string `json:"type_id"`
	SignatureTypeCode string `json:"signature_type_code,omitempty"`
	SignatureTypeName string `json:"signature_type_name,omitempty"`
	Step              int    `json:"step"`
	Condition         string `json:"condition"`
}

// --- Approval Sign (signer per step) ---

type ApprovalSignCreate struct {
	UserID string `json:"user_id"`
}

type ApprovalSignUpdate struct {
	UserID *string `json:"user_id,omitempty"`
}

type ApprovalSignResponse struct {
	ID       string `json:"id"`
	StepID   string `json:"step_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username,omitempty"`
	Fullname string `json:"fullname,omitempty"`
}

// --- Signature Form (pengajuan) ---

type SignatureFormCreate struct {
	SignatureTypeID string `json:"signature_type_id"`
	Step            int    `json:"step"`
	RequestID       string `json:"request_id"`
	Condition       string `json:"condition"`
	Status          string `json:"status"`
}

type SignatureFormUpdate struct {
	SignatureTypeID *string `json:"signature_type_id,omitempty"`
	Step            *int    `json:"step,omitempty"`
	RequestID       *string `json:"request_id,omitempty"`
	Condition       *string `json:"condition,omitempty"`
	Status          *string `json:"status,omitempty"`
}

type SignatureFormResponse struct {
	ID                string  `json:"id"`
	SignatureTypeID   *string `json:"signature_type_id,omitempty"`
	SignatureTypeCode string  `json:"signature_type_code,omitempty"`
	SignatureTypeName string  `json:"signature_type_name,omitempty"`
	Step              int     `json:"step"`
	RequestID         string  `json:"request_id"`
	Condition         string  `json:"condition"`
	Status            string  `json:"status"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

// --- Signature Flag (sikap signer dalam form) ---

type SignatureFlagCreate struct {
	UserID  string  `json:"user_id"`
	Status  string  `json:"status"`
	Comment *string `json:"comment,omitempty"`
}

type SignatureFlagUpdate struct {
	Status  *string `json:"status,omitempty"`
	Comment *string `json:"comment,omitempty"`
}

type SignatureFlagResponse struct {
	ID        string  `json:"id"`
	FormID    string  `json:"form_id"`
	UserID    string  `json:"user_id"`
	Username  string  `json:"username,omitempty"`
	Fullname  string  `json:"fullname,omitempty"`
	Status    string  `json:"status"`
	Comment   *string `json:"comment,omitempty"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

var SignatureStatuses = map[string]bool{
	"PENDING":   true,
	"APPROVED":  true,
	"REJECTED":  true,
	"CANCELLED": true,
}

var SignatureConditions = map[string]bool{
	"ANY_APPROVED": true,
	"ALL_APPROVED": true,
}
