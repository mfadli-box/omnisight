package sys

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// SYS01Profile menangani GET /rest/pages/SYS01/profile — profil user login.
func SYS01Profile(c *gin.Context) {
	userID := c.GetString("userId")
	data, err := Profile(c.Request.Context(), userID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load profile", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// SYS02Password menangani PUT /rest/pages/SYS02/password — ganti password.
func SYS02Password(c *gin.Context) {
	userID := c.GetString("userId")
	var in PasswordChange
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	if err := ChangePassword(c.Request.Context(), userID, in.OldPassword, in.NewPassword); err != nil {
		mechanic.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Password updated"})
}

// SYS03History menangani GET /rest/pages/SYS03/history — riwayat login.
func SYS03History(c *gin.Context) {
	p := mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
	userID := c.GetString("userId")
	data, err := History(c.Request.Context(), p, userID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load history", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}
