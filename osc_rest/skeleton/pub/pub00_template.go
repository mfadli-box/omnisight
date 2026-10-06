package pub

import "time"

// CompanyOption adalah opsi company untuk dropdown login.
type CompanyOption struct {
	ID   string `json:"company_id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// LoginRequest adalah payload login dari halaman /login.
type LoginRequest struct {
	CompanyID string `json:"company_id"`
	Username  string `json:"username"`
	Password  string `json:"password"`
}

// UserProfile adalah profil user yang dikembalikan setelah login.
type UserProfile struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	Email       string  `json:"email"`
	Fullname    string  `json:"fullname"`
	Phone       *string `json:"phone,omitempty"`
	Role        string  `json:"role"`
	Job         string  `json:"job"`
	CompanyID   string  `json:"company_id"`
	CompanyName string  `json:"company_name"`
	IsAdmin     bool    `json:"is_admin"`
	IsHris      bool    `json:"is_hris"`
	IsActive    bool    `json:"is_active"`
}

// LoginResponse adalah payload sukses login.
type LoginResponse struct {
	Token       string      `json:"token"`
	ExpiresAt   string      `json:"expires_at"`
	UserProfile UserProfile `json:"user_profile"`
}

// maxLoginAttempts adalah batas percobaan login sebelum akun dikunci.
const maxLoginAttempts = 5

// lockDuration adalah durasi penguncian akun setelah percobaan gagal.
const lockDuration = 15 * time.Minute

// sessionTTL adalah umur token akses.
const sessionTTL = 24 * time.Hour
