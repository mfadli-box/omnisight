package backbone

import (
	"net/http"
	"time"

	"osc_rest/skeleton/pub"
	"osc_rest/skeleton/app/app00"
	"osc_rest/skeleton/sys"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	rest := gin.New()
	rest.Use(RequestID())
	rest.Use(CustomRecovery())
	rest.Use(Logger())
	rest.SetTrustedProxies([]string{"localhost", "172.99.77.1"})
	rest.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:37771", "http://172.99.77.1:37771"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Company-ID"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	rest.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	rest.GET("/rest", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "rest"}) })
	rest.GET("/hook", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "hook"}) })
	SetDatabase()

	guest := rest.Group("/rest/guest")
	guest.GET("/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "guest"}) })

	pages := rest.Group("/rest/pages")
	pages.Use(USLoad())
	auths := rest.Group("/rest/pages")
	auths.Use(USAuth())
	admin := rest.Group("/rest/pages")
	admin.Use(USAuth(), USLock())
	pages.GET("/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "pages"}) })
	pub.Use(PgSQL)
	app.Use(PgSQL)
	sys.Use(PgSQL)

	agent := rest.Group("/rest/agent")
	agent.Use(USBots())
	agent.GET("/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "agent"}) })

	guest.GET("/PUB00", pub.PUB00Company)
	guest.POST("/PUB00", pub.PUB00Login)

	auths.DELETE("/APP00", app.APP00Logout)
	auths.GET("/APP00/company", app.APP00Company)
	auths.GET("/APP00/module", app.APP00Module)
	auths.GET("/SYS01/profile", sys.SYS01Profile)
	auths.PUT("/SYS02/password", sys.SYS02Password)
	auths.GET("/SYS03/history", sys.SYS03History)

	return rest
}
