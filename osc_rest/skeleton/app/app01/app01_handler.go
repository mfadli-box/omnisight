package app

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// APP01ModulesList menangani GET /rest/pages/APP01/modules - daftar module (grid).
func APP01ModulesList(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	data, err := ListModules(c.Request.Context(), p)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load modules", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP01ModulesGet menangani GET /rest/pages/APP01/modules/:id - detail module.
func APP01ModulesGet(c *gin.Context) {
	id := c.Param("id")
	data, err := GetModule(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Module not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP01ModulesCreate menangani POST /rest/pages/APP01/modules - tambah module.
func APP01ModulesCreate(c *gin.Context) {
	var in ModuleCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateModule(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create module", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP01ModulesUpdate menangani PUT /rest/pages/APP01/modules/:id - ubah module.
func APP01ModulesUpdate(c *gin.Context) {
	id := c.Param("id")
	var in ModuleUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateModule(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update module", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP01ModulesDelete menangani DELETE /rest/pages/APP01/modules/:id - hapus module.
func APP01ModulesDelete(c *gin.Context) {
	id := c.Param("id")
	if err := DeleteModule(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete module", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Module deleted"})
}

// APP01Options menangani options module untuk dropdown/select.
func APP01Options(c *gin.Context) {
	_ = c.Query("search")
	c.JSON(http.StatusOK, gin.H{"data": []string{}})
}
