package app

type UserCreate struct {
	Username     string  `json:"username"`
	Email        string  `json:"email"`
	Password     string  `json:"password"`
	Fullname     string  `json:"fullname"`
	Phone        *string `json:"phone,omitempty"`
	CompanyID    string  `json:"company_id"`
	EmployeeID   *string `json:"employee_id,omitempty"`
	LocationID   *string `json:"location_id,omitempty"`
	DepartmentID *string `json:"department_id,omitempty"`
	DivisionID   *string `json:"division_id,omitempty"`
	Role         string  `json:"role"`
	Job          string  `json:"job"`
	Key          string  `json:"key"`
	IsAdmin      bool    `json:"is_admin"`
	IsHris       bool    `json:"is_hris"`
	IsActive     bool    `json:"is_active"`
}

type UserUpdate struct {
	Email        *string `json:"email,omitempty"`
	Password     *string `json:"password,omitempty"`
	Fullname     *string `json:"fullname,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	CompanyID    *string `json:"company_id,omitempty"`
	EmployeeID   *string `json:"employee_id,omitempty"`
	LocationID   *string `json:"location_id,omitempty"`
	DepartmentID *string `json:"department_id,omitempty"`
	DivisionID   *string `json:"division_id,omitempty"`
	Role         *string `json:"role,omitempty"`
	Job          *string `json:"job,omitempty"`
	Key          *string `json:"key,omitempty"`
	IsAdmin      *bool   `json:"is_admin,omitempty"`
	IsHris       *bool   `json:"is_hris,omitempty"`
	IsActive     *bool   `json:"is_active,omitempty"`
}

type UserResponse struct {
	ID           string  `json:"id"`
	Username     string  `json:"username"`
	Email        string  `json:"email"`
	Fullname     string  `json:"fullname"`
	Phone        *string `json:"phone,omitempty"`
	CompanyID    string  `json:"company_id"`
	CompanyName  string  `json:"company_name,omitempty"`
	EmployeeID   *string `json:"employee_id,omitempty"`
	LocationID   *string `json:"location_id,omitempty"`
	DepartmentID *string `json:"department_id,omitempty"`
	DivisionID   *string `json:"division_id,omitempty"`
	Role         string  `json:"role"`
	Job          string  `json:"job"`
	Key          string  `json:"key"`
	IsAdmin      bool    `json:"is_admin"`
	IsHris       bool    `json:"is_hris"`
	IsActive     bool    `json:"is_active"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

type UserCompanyCreate struct {
	CompanyID string `json:"company_id"`
	IsActive  bool   `json:"is_active"`
}

type UserCompanyUpdate struct {
	IsActive *bool `json:"is_active,omitempty"`
}

type UserCompanyResponse struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	CompanyID   string `json:"company_id"`
	CompanyCode string `json:"company_code,omitempty"`
	CompanyName string `json:"company_name,omitempty"`
	IsActive    bool   `json:"is_active"`
	CreatedAt   string `json:"created_at"`
}

type UserPrivilegeCreate struct {
	ModuleID string `json:"module_id"`
	Level    string `json:"level"`
}

type UserPrivilegeUpdate struct {
	Level *string `json:"level,omitempty"`
}

type UserPrivilegeResponse struct {
	ID            string `json:"id"`
	UserCompanyID string `json:"user_company_id"`
	ModuleID      string `json:"module_id"`
	ModuleCode    string `json:"module_code,omitempty"`
	ModuleName    string `json:"module_name,omitempty"`
	Level         string `json:"level"`
	CreatedAt     string `json:"created_at"`
}

type UserAreaCreate struct {
	CompanyAreaID string `json:"company_area_id"`
	IsActive      bool   `json:"is_active"`
}

type UserAreaUpdate struct {
	IsActive *bool `json:"is_active,omitempty"`
}

type UserAreaResponse struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	CompanyAreaID string `json:"company_area_id"`
	AreaCode      string `json:"area_code,omitempty"`
	AreaName      string `json:"area_name,omitempty"`
	CompanyName   string `json:"company_name,omitempty"`
	IsActive      bool   `json:"is_active"`
	CreatedAt     string `json:"created_at"`
}

var PrivilegeLevels = map[string]bool{
	"HIDE": true,
	"VIEW": true,
	"BOOK": true,
	"POST": true,
}
