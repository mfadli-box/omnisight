package backbone

import (
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

var Log zerolog.Logger

func init() {
	output := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}
	Log = zerolog.New(output).With().Timestamp().Logger()
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := c.GetHeader("X-Request-ID")
		if rid == "" {
			rid = uuid.New().String()
		}
		c.Set("request_id", rid)
		c.Header("X-Request-ID", rid)
		c.Next()
	}
}

func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start)
		status := c.Writer.Status()
		event := Log.Info()
		if status >= 400 {
			event = Log.Warn()
		}
		if status >= 500 {
			event = Log.Error()
		}
		event.
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", status).
			Str("ip", c.ClientIP()).
			Dur("duration", duration).
			Str("request_id", c.GetString("request_id")).
			Str("user_id", c.GetString("userId")).
			Str("company_id", c.GetString("companyId")).
			Msg("request handled")
	}
}
