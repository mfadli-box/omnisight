package app

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// APP03UsersList menangani GET /rest/pages/APP03/users - daftar user (grid).
func APP03UsersList(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	data, err := ListUsers(c.Request.Context(), p)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load users", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersGet menangani GET /rest/pages/APP03/users/:id - detail user.
func APP03UsersGet(c *gin.Context) {
	id := c.Param("id")
	data, err := GetUser(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("User not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersCreate menangani POST /rest/pages/APP03/users - tambah user.
func APP03UsersCreate(c *gin.Context) {
	var in UserCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateUser(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create user", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP03UsersUpdate menangani PUT /rest/pages/APP03/users/:id - ubah user.
func APP03UsersUpdate(c *gin.Context) {
	id := c.Param("id")
	var in UserUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateUser(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update user", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersDelete menangani DELETE /rest/pages/APP03/users/:id - hapus user.
func APP03UsersDelete(c *gin.Context) {
	id := c.Param("id")
	if err := DeleteUser(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete user", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}

// APP03UsersCompaniesList menangani GET /rest/pages/APP03/users/:id/companies.
func APP03UsersCompaniesList(c *gin.Context) {
	userID := c.Param("id")
	data, err := ListUserCompanies(c.Request.Context(), userID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load user companies", err))
		return
	}
	if data == nil {
		data = []UserCompanyResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersCompaniesCreate menangani POST /rest/pages/APP03/users/:id/companies.
func APP03UsersCompaniesCreate(c *gin.Context) {
	userID := c.Param("id")
	var in UserCompanyCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateUserCompany(c.Request.Context(), userID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to assign company", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP03UsersCompaniesUpdate menangani PUT /rest/pages/APP03/users/:id/companies/:uid.
func APP03UsersCompaniesUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in UserCompanyUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateUserCompany(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update user company", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersCompaniesDelete menangani DELETE /rest/pages/APP03/users/:id/companies/:uid.
func APP03UsersCompaniesDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteUserCompany(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to remove user company", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User company removed"})
}

// APP03UsersCompaniesPrivilegesList menangani GET /rest/pages/APP03/users/:id/companies/:uid/privileges.
func APP03UsersCompaniesPrivilegesList(c *gin.Context) {
	userCompanyID := c.Param("uid")
	data, err := ListUserPrivileges(c.Request.Context(), userCompanyID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load user privileges", err))
		return
	}
	if data == nil {
		data = []UserPrivilegeResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersCompaniesPrivilegesCreate menangani POST /rest/pages/APP03/users/:id/companies/:uid/privileges.
func APP03UsersCompaniesPrivilegesCreate(c *gin.Context) {
	userCompanyID := c.Param("uid")
	var in UserPrivilegeCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	if in.ModuleID == "" {
		mechanic.Error(c, mechanic.ValidationError("module_id is required"))
		return
	}
	if !PrivilegeLevels[in.Level] {
		mechanic.Error(c, mechanic.ValidationError("Invalid privilege level"))
		return
	}
	data, err := CreateUserPrivilege(c.Request.Context(), userCompanyID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create privilege", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP03UsersCompaniesPrivilegesUpdate menangani PUT /rest/pages/APP03/users/:id/companies/:uid/privileges/:pid.
func APP03UsersCompaniesPrivilegesUpdate(c *gin.Context) {
	id := c.Param("pid")
	var in UserPrivilegeUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	if in.Level != nil && !PrivilegeLevels[*in.Level] {
		mechanic.Error(c, mechanic.ValidationError("Invalid privilege level"))
		return
	}
	data, err := UpdateUserPrivilege(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update privilege", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersCompaniesPrivilegesDelete menangani DELETE /rest/pages/APP03/users/:id/companies/:uid/privileges/:pid.
func APP03UsersCompaniesPrivilegesDelete(c *gin.Context) {
	id := c.Param("pid")
	if err := DeleteUserPrivilege(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete privilege", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Privilege deleted"})
}

// APP03UsersAreasList menangani GET /rest/pages/APP03/users/:id/areas.
func APP03UsersAreasList(c *gin.Context) {
	userID := c.Param("id")
	data, err := ListUserAreas(c.Request.Context(), userID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load user areas", err))
		return
	}
	if data == nil {
		data = []UserAreaResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersAreasCreate menangani POST /rest/pages/APP03/users/:id/areas.
func APP03UsersAreasCreate(c *gin.Context) {
	userID := c.Param("id")
	var in UserAreaCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateUserArea(c.Request.Context(), userID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to assign area", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP03UsersAreasUpdate menangani PUT /rest/pages/APP03/users/:id/areas/:uid.
func APP03UsersAreasUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in UserAreaUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateUserArea(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update user area", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP03UsersAreasDelete menangani DELETE /rest/pages/APP03/users/:id/areas/:uid.
func APP03UsersAreasDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteUserArea(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to remove user area", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User area removed"})
}

// APP03Options menangani options user untuk dropdown/select.
func APP03Options(c *gin.Context) {
	_ = c.Query("search")
	c.JSON(http.StatusOK, gin.H{"data": []string{}})
}
