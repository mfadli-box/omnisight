package app

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

func APP02CompaniesList(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	data, err := ListCompanies(c.Request.Context(), p)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load companies", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesGet(c *gin.Context) {
	id := c.Param("id")
	data, err := GetCompany(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Company not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesCreate(c *gin.Context) {
	var in CompanyCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateCompany(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create company", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func APP02CompaniesUpdate(c *gin.Context) {
	id := c.Param("id")
	var in CompanyUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateCompany(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update company", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesDelete(c *gin.Context) {
	id := c.Param("id")
	if err := DeleteCompany(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete company", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Company deleted"})
}

func APP02CompaniesModulesList(c *gin.Context) {
	companyID := c.Param("id")
	data, err := ListCompanyModules(c.Request.Context(), companyID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load company modules", err))
		return
	}
	if data == nil {
		data = []CompanyModuleResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesModulesCreate(c *gin.Context) {
	companyID := c.Param("id")
	var in CompanyModuleCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateCompanyModule(c.Request.Context(), companyID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to assign module", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func APP02CompaniesModulesUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in CompanyModuleUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateCompanyModule(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update company module", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesModulesDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteCompanyModule(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to remove company module", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Company module removed"})
}

func APP02CompaniesAreasList(c *gin.Context) {
	companyID := c.Param("id")
	data, err := ListCompanyAreas(c.Request.Context(), companyID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load company areas", err))
		return
	}
	if data == nil {
		data = []CompanyAreaResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesAreasCreate(c *gin.Context) {
	companyID := c.Param("id")
	var in CompanyAreaCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateCompanyArea(c.Request.Context(), companyID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create area", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func APP02CompaniesAreasUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in CompanyAreaUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateCompanyArea(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update area", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP02CompaniesAreasDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteCompanyArea(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete area", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Area deleted"})
}

func APP02Options(c *gin.Context) {
	_ = c.Query("search")
	c.JSON(http.StatusOK, gin.H{"data": []string{}})
}
