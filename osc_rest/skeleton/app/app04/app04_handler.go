package app

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// --- Signature Type ---

// APP04TypesList menangani GET /rest/pages/APP04/types - daftar jenis tanda tangan.
func APP04TypesList(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	data, err := ListSignatureTypes(c.Request.Context(), p)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load signature types", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesGet menangani GET /rest/pages/APP04/types/:id.
func APP04TypesGet(c *gin.Context) {
	id := c.Param("id")
	data, err := GetSignatureType(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Signature type not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesCreate menangani POST /rest/pages/APP04/types.
func APP04TypesCreate(c *gin.Context) {
	var in SignatureTypeCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateSignatureType(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create signature type", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP04TypesUpdate menangani PUT /rest/pages/APP04/types/:id.
func APP04TypesUpdate(c *gin.Context) {
	id := c.Param("id")
	var in SignatureTypeUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateSignatureType(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update signature type", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesDelete menangani DELETE /rest/pages/APP04/types/:id.
func APP04TypesDelete(c *gin.Context) {
	id := c.Param("id")
	if err := DeleteSignatureType(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete signature type", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Signature type deleted"})
}

// --- Approval Step ---

// APP04TypesStepsList menangani GET /rest/pages/APP04/types/:id/steps.
func APP04TypesStepsList(c *gin.Context) {
	typeID := c.Param("id")
	data, err := ListApprovalSteps(c.Request.Context(), typeID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load approval steps", err))
		return
	}
	if data == nil {
		data = []ApprovalStepResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesStepsGet menangani GET /rest/pages/APP04/types/:id/steps/:sid.
func APP04TypesStepsGet(c *gin.Context) {
	id := c.Param("sid")
	data, err := GetApprovalStep(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Approval step not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesStepsCreate menangani POST /rest/pages/APP04/types/:id/steps.
func APP04TypesStepsCreate(c *gin.Context) {
	typeID := c.Param("id")
	var in ApprovalStepCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateApprovalStep(c.Request.Context(), typeID, in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP04TypesStepsUpdate menangani PUT /rest/pages/APP04/types/:id/steps/:sid.
func APP04TypesStepsUpdate(c *gin.Context) {
	id := c.Param("sid")
	var in ApprovalStepUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateApprovalStep(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesStepsDelete menangani DELETE /rest/pages/APP04/types/:id/steps/:sid.
func APP04TypesStepsDelete(c *gin.Context) {
	id := c.Param("sid")
	if err := DeleteApprovalStep(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete approval step", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Approval step deleted"})
}

// --- Approval Sign ---

// APP04TypesStepsSignersList menangani GET /rest/pages/APP04/types/:id/steps/:sid/signers.
func APP04TypesStepsSignersList(c *gin.Context) {
	stepID := c.Param("sid")
	data, err := ListApprovalSigns(c.Request.Context(), stepID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load signers", err))
		return
	}
	if data == nil {
		data = []ApprovalSignResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesStepsSignersCreate menangani POST /rest/pages/APP04/types/:id/steps/:sid/signers.
func APP04TypesStepsSignersCreate(c *gin.Context) {
	stepID := c.Param("sid")
	var in ApprovalSignCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateApprovalSign(c.Request.Context(), stepID, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to add signer", err))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP04TypesStepsSignersUpdate menangani PUT /rest/pages/APP04/types/:id/steps/:sid/signers/:uid.
func APP04TypesStepsSignersUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in ApprovalSignUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateApprovalSign(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to update signer", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04TypesStepsSignersDelete menangani DELETE /rest/pages/APP04/types/:id/steps/:sid/signers/:uid.
func APP04TypesStepsSignersDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteApprovalSign(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to remove signer", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Signer removed"})
}

// --- Signature Form ---

// APP04FormsList menangani GET /rest/pages/APP04/forms - daftar form pengajuan.
func APP04FormsList(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	data, err := ListSignatureForms(c.Request.Context(), p)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load signature forms", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04FormsGet menangani GET /rest/pages/APP04/forms/:id.
func APP04FormsGet(c *gin.Context) {
	id := c.Param("id")
	data, err := GetSignatureForm(c.Request.Context(), id)
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Signature form not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04FormsCreate menangani POST /rest/pages/APP04/forms.
func APP04FormsCreate(c *gin.Context) {
	var in SignatureFormCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateSignatureForm(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP04FormsUpdate menangani PUT /rest/pages/APP04/forms/:id.
func APP04FormsUpdate(c *gin.Context) {
	id := c.Param("id")
	var in SignatureFormUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateSignatureForm(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04FormsDelete menangani DELETE /rest/pages/APP04/forms/:id.
func APP04FormsDelete(c *gin.Context) {
	id := c.Param("id")
	if err := DeleteSignatureForm(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete signature form", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Signature form deleted"})
}

// --- Signature Flag ---

// APP04FormsFlagsList menangani GET /rest/pages/APP04/forms/:id/flags.
func APP04FormsFlagsList(c *gin.Context) {
	formID := c.Param("id")
	data, err := ListSignatureFlags(c.Request.Context(), formID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load signature flags", err))
		return
	}
	if data == nil {
		data = []SignatureFlagResponse{}
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04FormsFlagsCreate menangani POST /rest/pages/APP04/forms/:id/flags.
func APP04FormsFlagsCreate(c *gin.Context) {
	formID := c.Param("id")
	var in SignatureFlagCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateSignatureFlag(c.Request.Context(), formID, in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// APP04FormsFlagsUpdate menangani PUT /rest/pages/APP04/forms/:id/flags/:uid.
func APP04FormsFlagsUpdate(c *gin.Context) {
	id := c.Param("uid")
	var in SignatureFlagUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateSignatureFlag(c.Request.Context(), id, in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// APP04FormsFlagsDelete menangani DELETE /rest/pages/APP04/forms/:id/flags/:uid.
func APP04FormsFlagsDelete(c *gin.Context) {
	id := c.Param("uid")
	if err := DeleteSignatureFlag(c.Request.Context(), id); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete signature flag", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Signature flag deleted"})
}

// APP04Options menangani options user untuk dropdown/select.
func APP04Options(c *gin.Context) {
	_ = c.Query("search")
	c.JSON(http.StatusOK, gin.H{"data": []string{}})
}
