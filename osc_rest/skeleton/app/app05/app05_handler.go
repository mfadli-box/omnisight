package app

import (
	"net/http"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
)

func gridParams(c *gin.Context) mechanic.GridParams {
	return mechanic.GridParams{
		Search:   c.Query("search"),
		Page:     mechanic.IntVal(c.Query("page"), 1),
		PageSize: mechanic.IntVal(c.Query("page_size"), 25),
		Sort:     c.Query("sort"),
		Order:    c.Query("order"),
	}
}

// --- User Session ---

func APP05SessionsList(c *gin.Context) {
	data, err := ListSessions(c.Request.Context(), gridParams(c))
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load sessions", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05SessionsGet(c *gin.Context) {
	data, err := GetSession(c.Request.Context(), c.Param("id"))
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Session not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05SessionsCreate(c *gin.Context) {
	var in SessionCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateSession(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func APP05SessionsUpdate(c *gin.Context) {
	var in SessionUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateSession(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05SessionsDelete(c *gin.Context) {
	if err := DeleteSession(c.Request.Context(), c.Param("id")); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete session", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Session deleted"})
}

// --- User Token ---

func APP05TokensList(c *gin.Context) {
	data, err := ListTokens(c.Request.Context(), gridParams(c))
	if err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to load tokens", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05TokensGet(c *gin.Context) {
	data, err := GetToken(c.Request.Context(), c.Param("id"))
	if err != nil {
		mechanic.Error(c, mechanic.NotFound("Token not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05TokensCreate(c *gin.Context) {
	var in TokenCreate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := CreateToken(c.Request.Context(), in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func APP05TokensUpdate(c *gin.Context) {
	var in TokenUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		mechanic.Error(c, mechanic.ValidationError("Invalid request body"))
		return
	}
	data, err := UpdateToken(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func APP05TokensDelete(c *gin.Context) {
	if err := DeleteToken(c.Request.Context(), c.Param("id")); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to delete token", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Token deleted"})
}
