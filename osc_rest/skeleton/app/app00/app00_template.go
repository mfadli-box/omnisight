package app

// CompanyItem adalah company milik user (SYS01/company).
type CompanyItem struct {
	CompanyID string `json:"company_id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
}

// ModuleNode adalah node pohon modul (SYS01/module).
type ModuleNode struct {
	ID       string        `json:"id"`
	Code     string        `json:"code"`
	Name     string        `json:"name"`
	Path     string        `json:"path"`
	IsPage   bool          `json:"is_page"`
	Children []*ModuleNode `json:"children,omitempty"`
}
