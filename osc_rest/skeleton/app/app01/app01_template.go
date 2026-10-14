package app

type ModuleCreate struct {
	ParentID *string `json:"parent_id,omitempty"`
	Code     string  `json:"code"`
	Name     string  `json:"name"`
	Path     string  `json:"path"`
	IsPage   bool    `json:"is_page"`
	IsActive bool    `json:"is_active"`
}

type ModuleUpdate struct {
	ParentID *string `json:"parent_id,omitempty"`
	Code     *string `json:"code,omitempty"`
	Name     *string `json:"name,omitempty"`
	Path     *string `json:"path,omitempty"`
	IsPage   *bool   `json:"is_page,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

type ModuleResponse struct {
	ID        string  `json:"id"`
	ParentID  *string `json:"parent_id,omitempty"`
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	Path      string  `json:"path"`
	IsPage    bool    `json:"is_page"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}
