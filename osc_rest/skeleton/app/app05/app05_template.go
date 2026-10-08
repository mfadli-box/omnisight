package app

// --- User Session (app_user_session) ---

type SessionCreate struct {
	UserID       string  `json:"user_id"`
	SessionToken string  `json:"session_token"`
	IPAddress    *string `json:"ip_address,omitempty"`
	UserAgent    *string `json:"user_agent,omitempty"`
	Status       string  `json:"status"`
	PolicyID     *string `json:"policy_id,omitempty"`
}

type SessionUpdate struct {
	IPAddress *string `json:"ip_address,omitempty"`
	UserAgent *string `json:"user_agent,omitempty"`
	Status    *string `json:"status,omitempty"`
	PolicyID  *string `json:"policy_id,omitempty"`
	End       *bool   `json:"end,omitempty"`
}

type SessionResponse struct {
	ID           string  `json:"id"`
	UserID       string  `json:"user_id"`
	Username     string  `json:"username,omitempty"`
	Fullname     string  `json:"fullname,omitempty"`
	SessionToken string  `json:"session_token"`
	IPAddress    *string `json:"ip_address,omitempty"`
	UserAgent    *string `json:"user_agent,omitempty"`
	StartedAt    string  `json:"started_at"`
	LastActive   string  `json:"last_active"`
	EndedAt      *string `json:"ended_at,omitempty"`
	Status       string  `json:"status"`
	PolicyID     *string `json:"policy_id,omitempty"`
}

// --- User Token (app_user_token) ---

type TokenCreate struct {
	UserID           string  `json:"user_id"`
	TokenType        string  `json:"token_type"`
	Token            string  `json:"token"`
	RefreshToken     *string `json:"refresh_token,omitempty"`
	Fingerprint      *string `json:"fingerprint,omitempty"`
	IPAddress        *string `json:"ip_address,omitempty"`
	UserAgent        *string `json:"user_agent,omitempty"`
	DeviceID         *string `json:"device_id,omitempty"`
	AccessExpiresAt  string  `json:"access_expires_at"`
	RefreshExpiresAt *string `json:"refresh_expires_at,omitempty"`
	IsBlocked        bool    `json:"is_blocked"`
	BlockedReason    *string `json:"blocked_reason,omitempty"`
}

type TokenUpdate struct {
	TokenType        *string `json:"token_type,omitempty"`
	Fingerprint      *string `json:"fingerprint,omitempty"`
	IPAddress        *string `json:"ip_address,omitempty"`
	UserAgent        *string `json:"user_agent,omitempty"`
	DeviceID         *string `json:"device_id,omitempty"`
	AccessExpiresAt  *string `json:"access_expires_at,omitempty"`
	RefreshExpiresAt *string `json:"refresh_expires_at,omitempty"`
	IsBlocked        *bool   `json:"is_blocked,omitempty"`
	BlockedReason    *string `json:"blocked_reason,omitempty"`
	Revoke           *bool   `json:"revoke,omitempty"`
	RevokedReason    *string `json:"revoked_reason,omitempty"`
}

type TokenResponse struct {
	ID               string  `json:"id"`
	UserID           string  `json:"user_id"`
	Username         string  `json:"username,omitempty"`
	Fullname         string  `json:"fullname,omitempty"`
	TokenType        string  `json:"token_type"`
	Token            string  `json:"token"`
	RefreshToken     *string `json:"refresh_token,omitempty"`
	Fingerprint      *string `json:"fingerprint,omitempty"`
	IPAddress        *string `json:"ip_address,omitempty"`
	UserAgent        *string `json:"user_agent,omitempty"`
	DeviceID         *string `json:"device_id,omitempty"`
	IssuedAt         string  `json:"issued_at"`
	AccessExpiresAt  string  `json:"access_expires_at"`
	RefreshExpiresAt *string `json:"refresh_expires_at,omitempty"`
	LastActivityAt   *string `json:"last_activity_at,omitempty"`
	IsBlocked        bool    `json:"is_blocked"`
	BlockedReason    *string `json:"blocked_reason,omitempty"`
	ImpersonatedBy   *string `json:"impersonated_by,omitempty"`
	RevokedAt        *string `json:"revoked_at,omitempty"`
	RevokedReason    *string `json:"revoked_reason,omitempty"`
	CreatedAt        string  `json:"created_at"`
}

var SessionStatuses = map[string]bool{
	"ACTIVE":  true,
	"EXPIRED": true,
	"ENDED":   true,
	"REVOKED": true,
}

var TokenTypes = map[string]bool{
	"JWT":     true,
	"WEB":     true,
	"REFRESH": true,
	"API":     true,
}
