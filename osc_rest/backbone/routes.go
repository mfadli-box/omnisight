package backbone

import (
	"net/http"
	"time"

	app00 "osc_rest/skeleton/app/app00"
	app01 "osc_rest/skeleton/app/app01"
	app02 "osc_rest/skeleton/app/app02"
	"osc_rest/skeleton/pub"
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
	app00.Use(PgSQL)
	app01.Use(PgSQL)
	app02.Use(PgSQL)
	sys.Use(PgSQL)

	agent := rest.Group("/rest/agent")
	agent.Use(USBots())
	agent.GET("/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "agent"}) })

	guest.GET("/PUB00", pub.PUB00Company)
	guest.POST("/PUB00", pub.PUB00Login)

	auths.DELETE("/APP00", app00.APP00Logout)
	auths.GET("/APP00/company", app00.APP00Company)
	auths.GET("/APP00/module", app00.APP00Module)
	auths.GET("/SYS01/profile", sys.SYS01Profile)
	auths.PUT("/SYS02/password", sys.SYS02Password)
	auths.GET("/SYS03/history", sys.SYS03History)

	admin.GET("/APP01/modules", app01.APP01ModulesList)
	admin.POST("/APP01/modules", app01.APP01ModulesCreate)
	admin.GET("/APP01/modules/:id", app01.APP01ModulesGet)
	admin.PUT("/APP01/modules/:id", app01.APP01ModulesUpdate)
	admin.DELETE("/APP01/modules/:id", app01.APP01ModulesDelete)

	admin.GET("/APP02/companies", app02.APP02CompaniesList)
	admin.POST("/APP02/companies", app02.APP02CompaniesCreate)
	admin.GET("/APP02/companies/:id", app02.APP02CompaniesGet)
	admin.PUT("/APP02/companies/:id", app02.APP02CompaniesUpdate)
	admin.DELETE("/APP02/companies/:id", app02.APP02CompaniesDelete)
	admin.GET("/APP02/companies/:id/modules", app02.APP02CompaniesModulesList)
	admin.POST("/APP02/companies/:id/modules", app02.APP02CompaniesModulesCreate)
	admin.PUT("/APP02/companies/:id/modules/:uid", app02.APP02CompaniesModulesUpdate)
	admin.DELETE("/APP02/companies/:id/modules/:uid", app02.APP02CompaniesModulesDelete)
	admin.GET("/APP02/companies/:id/areas", app02.APP02CompaniesAreasList)
	admin.POST("/APP02/companies/:id/areas", app02.APP02CompaniesAreasCreate)
	admin.PUT("/APP02/companies/:id/areas/:uid", app02.APP02CompaniesAreasUpdate)
	admin.DELETE("/APP02/companies/:id/areas/:uid", app02.APP02CompaniesAreasDelete)

	return rest
}
