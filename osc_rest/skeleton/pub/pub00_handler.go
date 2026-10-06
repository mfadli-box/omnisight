package pub

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// PUB00Company menangani GET /rest/guest/PUB00 > daftar company login.
func PUB00Company(c *gin.Context) {
	companies, err := Companies(c.Request.Context())
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load company list", err))
		return
	}
	if companies == nil {
		companies = []CompanyOption{}
	}
	c.JSON(http.StatusOK, gin.H{"data": companies})
}

// PUB00Login menangani POST /rest/guest/PUB00 > login pengguna.
func PUB00Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	session, err := Login(c.Request.Context(), req)
	if err != nil {
		switch {
		case err.Error() == "invalid username or password",
			err.Error() == "account is locked, try again later",
			err.Error() == "account is deactivated":
			mechanic.Error(c, mechanic.Unauthorized(err.Error()))
		default:
			mechanic.Error(c, mechanic.InternalError("Login failed", err))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": session})
}
