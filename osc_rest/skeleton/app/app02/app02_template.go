package app

type CompanyCreate struct {
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	Valuta    string  `json:"valuta"`
	VatID     *string `json:"vat_id,omitempty"`
	RegNo     *string `json:"reg_no,omitempty"`
	Address   *string `json:"address,omitempty"`
	TaxOffice *string `json:"tax_office,omitempty"`
	HrisLink  *string `json:"hris_link,omitempty"`
	IsActive  bool    `json:"is_active"`
}

type CompanyUpdate struct {
	Code      *string `json:"code,omitempty"`
	Name      *string `json:"name,omitempty"`
	Valuta    *string `json:"valuta,omitempty"`
	VatID     *string `json:"vat_id,omitempty"`
	RegNo     *string `json:"reg_no,omitempty"`
	Address   *string `json:"address,omitempty"`
	TaxOffice *string `json:"tax_office,omitempty"`
	HrisLink  *string `json:"hris_link,omitempty"`
	IsActive  *bool   `json:"is_active,omitempty"`
}

type CompanyResponse struct {
	ID        string  `json:"id"`
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	Valuta    string  `json:"valuta"`
	VatID     *string `json:"vat_id,omitempty"`
	RegNo     *string `json:"reg_no,omitempty"`
	Address   *string `json:"address,omitempty"`
	TaxOffice *string `json:"tax_office,omitempty"`
	HrisLink  *string `json:"hris_link,omitempty"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type CompanyModuleCreate struct {
	ModuleID string `json:"module_id"`
	IsActive bool   `json:"is_active"`
}

type CompanyModuleUpdate struct {
	IsActive *bool `json:"is_active,omitempty"`
}

type CompanyModuleResponse struct {
	ID         string `json:"id"`
	CompanyID  string `json:"company_id"`
	ModuleID   string `json:"module_id"`
	ModuleName string `json:"module_name,omitempty"`
	ModuleCode string `json:"module_code,omitempty"`
	IsActive   bool   `json:"is_active"`
	CreatedAt  string `json:"created_at"`
}

type CompanyAreaCreate struct {
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	IsActive    bool    `json:"is_active"`
}

type CompanyAreaUpdate struct {
	Code        *string `json:"code,omitempty"`
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

type CompanyAreaResponse struct {
	ID          string  `json:"id"`
	CompanyID   string  `json:"company_id"`
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	IsActive    bool    `json:"is_active"`
	CreatedAt   string  `json:"created_at"`
}
