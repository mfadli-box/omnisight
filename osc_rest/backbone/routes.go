package backbone

import (
	"net/http"
	"time"

	app00 "osc_rest/skeleton/app/app00"
	app01 "osc_rest/skeleton/app/app01"
	app02 "osc_rest/skeleton/app/app02"
	app03 "osc_rest/skeleton/app/app03"
	app04 "osc_rest/skeleton/app/app04"
	app05 "osc_rest/skeleton/app/app05"
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
	app03.Use(PgSQL)
	app04.Use(PgSQL)
	app05.Use(PgSQL)
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

	admin.GET("/APP03/users", app03.APP03UsersList)
	admin.POST("/APP03/users", app03.APP03UsersCreate)
	admin.GET("/APP03/users/:id", app03.APP03UsersGet)
	admin.PUT("/APP03/users/:id", app03.APP03UsersUpdate)
	admin.DELETE("/APP03/users/:id", app03.APP03UsersDelete)
	admin.GET("/APP03/users/:id/companies", app03.APP03UsersCompaniesList)
	admin.POST("/APP03/users/:id/companies", app03.APP03UsersCompaniesCreate)
	admin.PUT("/APP03/users/:id/companies/:uid", app03.APP03UsersCompaniesUpdate)
	admin.DELETE("/APP03/users/:id/companies/:uid", app03.APP03UsersCompaniesDelete)
	admin.GET("/APP03/users/:id/companies/:uid/privileges", app03.APP03UsersCompaniesPrivilegesList)
	admin.POST("/APP03/users/:id/companies/:uid/privileges", app03.APP03UsersCompaniesPrivilegesCreate)
	admin.PUT("/APP03/users/:id/companies/:uid/privileges/:pid", app03.APP03UsersCompaniesPrivilegesUpdate)
	admin.DELETE("/APP03/users/:id/companies/:uid/privileges/:pid", app03.APP03UsersCompaniesPrivilegesDelete)
	admin.GET("/APP03/users/:id/areas", app03.APP03UsersAreasList)
	admin.POST("/APP03/users/:id/areas", app03.APP03UsersAreasCreate)
	admin.PUT("/APP03/users/:id/areas/:uid", app03.APP03UsersAreasUpdate)
	admin.DELETE("/APP03/users/:id/areas/:uid", app03.APP03UsersAreasDelete)

	admin.GET("/APP04/types", app04.APP04TypesList)
	admin.POST("/APP04/types", app04.APP04TypesCreate)
	admin.GET("/APP04/types/:id", app04.APP04TypesGet)
	admin.PUT("/APP04/types/:id", app04.APP04TypesUpdate)
	admin.DELETE("/APP04/types/:id", app04.APP04TypesDelete)
	admin.GET("/APP04/types/:id/steps", app04.APP04TypesStepsList)
	admin.POST("/APP04/types/:id/steps", app04.APP04TypesStepsCreate)
	admin.GET("/APP04/types/:id/steps/:sid", app04.APP04TypesStepsGet)
	admin.PUT("/APP04/types/:id/steps/:sid", app04.APP04TypesStepsUpdate)
	admin.DELETE("/APP04/types/:id/steps/:sid", app04.APP04TypesStepsDelete)
	admin.GET("/APP04/types/:id/steps/:sid/signers", app04.APP04TypesStepsSignersList)
	admin.POST("/APP04/types/:id/steps/:sid/signers", app04.APP04TypesStepsSignersCreate)
	admin.PUT("/APP04/types/:id/steps/:sid/signers/:uid", app04.APP04TypesStepsSignersUpdate)
	admin.DELETE("/APP04/types/:id/steps/:sid/signers/:uid", app04.APP04TypesStepsSignersDelete)
	admin.GET("/APP04/forms", app04.APP04FormsList)
	admin.POST("/APP04/forms", app04.APP04FormsCreate)
	admin.GET("/APP04/forms/:id", app04.APP04FormsGet)
	admin.PUT("/APP04/forms/:id", app04.APP04FormsUpdate)
	admin.DELETE("/APP04/forms/:id", app04.APP04FormsDelete)
	admin.GET("/APP04/forms/:id/flags", app04.APP04FormsFlagsList)
	admin.POST("/APP04/forms/:id/flags", app04.APP04FormsFlagsCreate)
	admin.PUT("/APP04/forms/:id/flags/:uid", app04.APP04FormsFlagsUpdate)
	admin.DELETE("/APP04/forms/:id/flags/:uid", app04.APP04FormsFlagsDelete)

	admin.GET("/APP05/sessions", app05.APP05SessionsList)
	admin.POST("/APP05/sessions", app05.APP05SessionsCreate)
	admin.GET("/APP05/sessions/:id", app05.APP05SessionsGet)
	admin.PUT("/APP05/sessions/:id", app05.APP05SessionsUpdate)
	admin.DELETE("/APP05/sessions/:id", app05.APP05SessionsDelete)
	admin.GET("/APP05/tokens", app05.APP05TokensList)
	admin.POST("/APP05/tokens", app05.APP05TokensCreate)
	admin.GET("/APP05/tokens/:id", app05.APP05TokensGet)
	admin.PUT("/APP05/tokens/:id", app05.APP05TokensUpdate)
	admin.DELETE("/APP05/tokens/:id", app05.APP05TokensDelete)

	return rest
}
