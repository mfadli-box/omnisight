package backbone

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

func CustomRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				stack := debug.Stack()
				Log.Error().
					Interface("panic", r).
					Str("method", c.Request.Method).
					Str("path", c.Request.URL.Path).
					Str("request_id", c.GetString("request_id")).
					Bytes("stack", stack).
					Msg("panic recovered")
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"code":       "INTERNAL_ERROR",
					"error":      "An unexpected error occurred",
					"request_id": c.GetString("request_id"),
				})
				_ = fmt.Sprintf("%v", r)
			}
		}()
		c.Next()
	}
}
