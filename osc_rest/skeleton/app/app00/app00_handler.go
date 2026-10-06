package app

import (
	"context"
	"net/http"
	"strings"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

// APP00Logout menangani DELETE /rest/pages/SYS00 - logout (revoke token).
func APP00Logout(c *gin.Context) {
	token := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(token), "bearer ") {
		token = strings.TrimSpace(token[7:])
	}
	if token == "" {
		mechanic.Error(c, mechanic.Unauthorized("Token is required"))
		return
	}
	_, err := pg.Exec(context.Background(), `
		UPDATE	app_user_token
		SET		revoked_at = now(),
				revoked_reason = 'logout'
		WHERE	token = $1 AND revoked_at IS NULL`, token)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to revoke session", err))
		return
	}
	c.Status(http.StatusOK)
}

// APP00Company menangani GET /rest/pages/APP00/company - company user.
func APP00Company(c *gin.Context) {
	userID := c.GetString("userId")
	companies, err := UserCompanyList(c.Request.Context(), userID)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load company list", err))
		return
	}
	if companies == nil {
		companies = []CompanyItem{}
	}
	c.JSON(http.StatusOK, gin.H{"data": companies})
}

// APP00Module menangani GET /rest/pages/APP00/module - pohon modul.
func APP00Module(c *gin.Context) {
	companyID := c.Query("company_id")
	if companyID == "" {
		companyID = c.GetString("companyId")
	}
	tree, err := ModuleTree(
		c.Request.Context(),
		companyID,
		c.GetString("userId"),
		c.GetBool("isAdmin"),
	)
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load module tree", err))
		return
	}
	if tree == nil {
		tree = []*ModuleNode{}
	}
	c.JSON(http.StatusOK, gin.H{"data": tree})
}
