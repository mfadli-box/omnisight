package backbone

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type useMemory struct {
	db *pgxpool.Pool
}

type SessionMemory struct {
	UserId    string    `json:"user_id"`
	CompanyId string    `json:"company_id"`
	ExpiresAt time.Time `json:"expires_at"`
	IsActive  bool      `json:"is_active"`
	IsAdmin   bool      `json:"is_admin"`
	IsHris    bool      `json:"is_hris"`
}

func USLook(c *gin.Context) string {
	return c.GetString("userId")
}

func USLoad() gin.HandlerFunc {
	var db = PgSQL
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token required in Authorization header",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		token := authHeader
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token is required",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		query := `
			SELECT s.user_id, u.company_id, s.access_expires_at, u.is_active, u.is_admin, u.is_hris
			FROM   "app_user_token" s
			JOIN   "app_user" u ON s.user_id = u.id
			WHERE  s.token = $1
			  AND  s.revoked_at IS NULL
		`
		var session SessionMemory
		ctx := context.Background()
		err := db.QueryRow(ctx, query, token).Scan(
			&session.UserId,
			&session.CompanyId,
			&session.ExpiresAt,
			&session.IsActive,
			&session.IsAdmin,
			&session.IsHris,
		)
		if err != nil || session.ExpiresAt.Before(time.Now()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Session has expired or is invalid",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		if !session.IsActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "User account is deactivated",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		activeCompanyId := session.CompanyId
		if headerCID := c.GetHeader("X-Company-ID"); headerCID != "" && headerCID != session.CompanyId {
			var exists bool
			err = db.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM "app_user_company" WHERE user_id = $1 AND company_id = $2 AND is_active = true)`,
				session.UserId, headerCID,
			).Scan(&exists)
			if err != nil || !exists {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"code":       "FORBIDDEN",
					"error":      "You do not have access to the selected company",
					"request_id": c.GetString("request_id"),
				})
				return
			}
			activeCompanyId = headerCID
		}
		if activeCompanyId == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "No company selected. Please select a company first.",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Set("userId", session.UserId)
		c.Set("companyId", activeCompanyId)
		c.Set("isAdmin", session.IsAdmin)
		c.Set("isHris", session.IsHris)
		c.Next()
	}
}

func USAuth() gin.HandlerFunc {
	var db = PgSQL
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token required in Authorization header",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		token := authHeader
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token is required",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		query := `
			SELECT s.user_id, s.access_expires_at, u.is_active, u.is_admin, u.is_hris
			FROM   "app_user_token" s
			JOIN   "app_user" u ON s.user_id = u.id
			WHERE  s.token = $1
			  AND  s.revoked_at IS NULL
		`
		var (
			userID    string
			expiresAt time.Time
			isActive  bool
			isAdmin   bool
			isHris    bool
		)
		ctx := context.Background()
		err := db.QueryRow(ctx, query, token).Scan(
			&userID, &expiresAt, &isActive, &isAdmin, &isHris,
		)
		if err != nil || expiresAt.Before(time.Now()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Session has expired or is invalid",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		if !isActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "User account is deactivated",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Set("userId", userID)
		c.Set("isAdmin", isAdmin)
		c.Set("isHris", isHris)
		c.Next()
	}
}

func USBots() gin.HandlerFunc {
	expected := strings.TrimSpace(os.Getenv("CR_KEYS"))
	return func(c *gin.Context) {
		if expected == "" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"code":       "SERVICE_UNAVAILABLE",
				"error":      "Robot authentication is not configured",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token required in Authorization header",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		token := authHeader
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Token is required",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		valid := false
		for _, allowed := range strings.Split(expected, ",") {
			if strings.TrimSpace(allowed) == token {
				valid = true
				break
			}
		}
		if !valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Invalid robot token",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Next()
	}
}

func USLock() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin, exists := c.Get("isAdmin")
		if !exists || !isAdmin.(bool) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "Admin access only",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Next()
	}
}

func USLogs(moduleCode string) gin.HandlerFunc {
	var db = PgSQL
	return func(c *gin.Context) {
		c.Next()
		if c.Writer.Status() >= http.StatusBadRequest {
			return
		}
		action := strings.TrimSpace(c.Request.Method)
		switch action {
		case "POST", "PUT", "PATCH", "DELETE":
		default:
			return
		}
		userID := c.GetString("userId")
		if userID == "" {
			return
		}
		companyID := c.GetString("companyId")
		if companyID == "" {
			companyID = strings.TrimSpace(c.GetHeader("X-Company-ID"))
		}
		module := strings.TrimSpace(moduleCode)
		path := strings.TrimSpace(c.Request.URL.Path)
		ipAddress := strings.TrimSpace(c.ClientIP())
		userAgent := strings.TrimSpace(c.GetHeader("User-Agent"))
		auditID := uuid.New().String()
		queryP := `
			INSERT INTO "app_user_action" (
				id, user_id, company_id, module_code, action, path, ip_address, user_agent, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		`
		_, err := db.Exec(context.Background(), queryP,
			auditID,
			userID,
			companyID,
			module,
			action,
			path,
			ipAddress,
			userAgent)
		if err == nil {
			return
		}
		queryF := `
			INSERT INTO "app_user_action" (
				id, user_id, company_id, module_code, action, path, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, NOW())
		`
		_, err = db.Exec(context.Background(), queryF,
			auditID,
			userID,
			companyID,
			module,
			action,
			path)
		if err == nil {
			return
		}
		queryM := `
			INSERT INTO "app_user_action" (
				user_id, action, path
			) VALUES ($1, $2, $3)
		`
		if _, err = db.Exec(context.Background(), queryM,
			userID,
			action,
			path); err != nil {
			Log.Warn().Err(err).Str("module", moduleCode).Msg("failed to write audit log")
		}
	}
}

func USRole(moduleCode string, requiredLevel string) gin.HandlerFunc {
	var db = PgSQL
	rank := map[string]int{"HIDE": 0, "VIEW": 1, "BOOK": 2, "POST": 3}
	requiredInt, known := rank[requiredLevel]
	if !known {
		requiredInt = rank["POST"]
	}
	return func(c *gin.Context) {
		isAdmin, exists := c.Get("isAdmin")
		if exists && isAdmin.(bool) {
			c.Next()
			return
		}
		userID := c.GetString("userId")
		companyID := c.GetString("companyId")
		if companyID == "" {
			companyID = strings.TrimSpace(c.GetHeader("X-Company-ID"))
		}
		if userID == "" || companyID == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "User context not loaded",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		query := `
			SELECT up.level::text
			FROM   "app_user_privilege" up
			JOIN   "app_module" m ON m.id = up.module_id
			JOIN   "app_user_company" uc ON uc.id = up.user_company_id
			WHERE  uc.user_id = $1
			AND    uc.company_id = $2
			AND    uc.is_active = true
			AND    m.code = $3
			LIMIT  1
		`
		var level string
		err := db.QueryRow(context.Background(), query, userID, companyID, moduleCode).Scan(&level)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       "FORBIDDEN",
				"error":      "Access denied — no privilege found",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		level = strings.TrimSpace(level)
		if rank[level] < requiredInt {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":       "UNAUTHORIZED",
				"error":      "Insufficient privilege",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Next()
	}
}
