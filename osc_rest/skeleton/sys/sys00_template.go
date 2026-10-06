package sys

// ProfileResponse adalah profil user yang sedang login.
type ProfileResponse struct {
	ID          string        `json:"id"`
	Username    string        `json:"username"`
	Email       string        `json:"email"`
	Fullname    string        `json:"fullname"`
	Phone       *string       `json:"phone,omitempty"`
	Role        string        `json:"role"`
	Job         string        `json:"job"`
	CompanyID   string        `json:"company_id"`
	CompanyName string        `json:"company_name"`
	IsAdmin     bool          `json:"is_admin"`
	IsHris      bool          `json:"is_hris"`
	IsActive    bool          `json:"is_active"`
	Companies   []CompanyItem `json:"companies"`
}

// CompanyItem adalah company milik user.
type CompanyItem struct {
	CompanyID string `json:"company_id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
}

// PasswordChange adalah payload ganti password.
type PasswordChange struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// HistoryResponse adalah satu baris riwayat sesi/login user.
type HistoryResponse struct {
	ID              string  `json:"id"`
	TokenType       string  `json:"token_type"`
	IPAddress       *string `json:"ip_address,omitempty"`
	UserAgent       *string `json:"user_agent,omitempty"`
	IssuedAt        string  `json:"issued_at"`
	AccessExpiresAt string  `json:"access_expires_at"`
	IsBlocked       bool    `json:"is_blocked"`
	RevokedAt       *string `json:"revoked_at,omitempty"`
	RevokedReason   *string `json:"revoked_reason,omitempty"`
	CreatedAt       string  `json:"created_at"`
}
