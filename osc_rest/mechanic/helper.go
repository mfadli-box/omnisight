package mechanic

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

var log zerolog.Logger

func init() {
	output := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}
	log = zerolog.New(output).With().Timestamp().Logger()
}

type AppError struct {
	Code    string
	Status  int
	Message string
	Err     error
}

func (e *AppError) Error() string {
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

func ValidationError(msg string) *AppError {
	return &AppError{
		Code:    "VALIDATION_ERROR",
		Status:  http.StatusBadRequest,
		Message: msg,
	}
}

func NotFound(msg string) *AppError {
	return &AppError{
		Code:    "NOT_FOUND",
		Status:  http.StatusNotFound,
		Message: msg,
	}
}

func Conflict(msg string) *AppError {
	return &AppError{
		Code:    "CONFLICT",
		Status:  http.StatusConflict,
		Message: msg,
	}
}

func Unauthorized(msg string) *AppError {
	return &AppError{
		Code:    "UNAUTHORIZED",
		Status:  http.StatusUnauthorized,
		Message: msg,
	}
}

func Forbidden(msg string) *AppError {
	return &AppError{
		Code:    "FORBIDDEN",
		Status:  http.StatusForbidden,
		Message: msg,
	}
}

func ExternalServiceError(msg string, err error) *AppError {
	return &AppError{
		Code:    "EXTERNAL_SERVICE_ERROR",
		Status:  http.StatusBadGateway,
		Message: msg,
		Err:     err,
	}
}

func InternalError(msg string, err error) *AppError {
	return &AppError{
		Code:    "INTERNAL_ERROR",
		Status:  http.StatusInternalServerError,
		Message: msg,
		Err:     err,
	}
}

func LogWarn(msg string, err error, key, value string) {
	log.Warn().Err(err).Str(key, value).Msg(msg)
}

func Error(c *gin.Context, err error) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		event := log.Warn().
			Str("code", appErr.Code).
			Str("error", appErr.Message).
			Int("status", appErr.Status).
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Str("request_id", c.GetString("request_id")).
			Str("user_id", c.GetString("userId"))
		if appErr.Err != nil {
			event = event.Err(appErr.Err)
		}
		event.Msg("app error")
		c.JSON(appErr.Status, gin.H{
			"code":       appErr.Code,
			"error":      appErr.Message,
			"request_id": c.GetString("request_id"),
		})
		return
	}
	var verr Verr
	if errors.As(err, &verr) {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":       "VALIDATION_ERROR",
			"error":      verr.Msg,
			"request_id": c.GetString("request_id"),
		})
		return
	}
	log.Error().
		Err(err).
		Str("method", c.Request.Method).
		Str("path", c.Request.URL.Path).
		Str("request_id", c.GetString("request_id")).
		Str("user_id", c.GetString("userId")).
		Msg("unhandled error")
	c.JSON(http.StatusInternalServerError, gin.H{
		"code":       "INTERNAL_ERROR",
		"error":      "An unexpected error occurred",
		"request_id": c.GetString("request_id"),
	})
}

type Verr struct{ Msg string }

func (e Verr) Error() string { return e.Msg }

func BadRequest(msg string) error { return Verr{Msg: msg} }

type SelectItem struct {
	ID   string
	Name string
	Code string
}

func Str(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func StrP(v *string, def string) string {
	if v == nil || *v == "" {
		return def
	}
	return *v
}

type GridParams struct {
	Search   string
	DateNow  string
	DateFrom string
	DateTo   string
	Page     int
	PageSize int
	Sort     string
	Order    string
}

type DateFilter struct {
	Enabled bool
	Column  string
}

type Page[T any] struct {
	Rows      []T
	Total     int64
	Page      int
	PageSize  int
	TotalPage int
}

func (p *GridParams) Default() {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = 25
	}
	if p.PageSize > 500 {
		p.PageSize = 500
	}
	p.Order = strings.ToUpper(strings.TrimSpace(p.Order))
	if p.Order != "ASC" && p.Order != "DESC" {
		p.Order = "ASC"
	}
}

func Like(s string) string {
	return "%" + strings.ReplaceAll(strings.TrimSpace(s), "%", `\%`) + "%"
}

func OrderClause(sort, order string, allowed map[string]string, defaultCol string) string {
	if c, ok := allowed[sort]; ok {
		return " ORDER BY " + c + " " + order
	}
	return " ORDER BY " + defaultCol
}

func LimitOffset(p GridParams) (limit, offset int) {
	p.Default()
	return p.PageSize, (p.Page - 1) * p.PageSize
}

func TotalPage(total int64, pageSize int) int {
	if pageSize < 1 {
		return 1
	}
	tp := int((total + int64(pageSize) - 1) / int64(pageSize))
	if tp < 1 {
		return 1
	}
	return tp
}

func IntVal(s string, def int) int {
	if s == "" {
		return def
	}
	v := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return def
		}
		v = v*10 + int(ch-'0')
	}
	if v == 0 {
		return def
	}
	return v
}

func ApplyDateFilter(p GridParams, where *string, args *[]any, filters []DateFilter) {
	for _, f := range filters {
		if !f.Enabled {
			continue
		}
		argn := len(*args) + 1
		switch f.Column {
		case "date_now":
			if p.DateNow != "" {
				*where += " AND " + f.Column + " = $" + fmt.Sprintf("%d", argn)
				*args = append(*args, p.DateNow)
			}
		case "date_from":
			if p.DateFrom != "" {
				*where += " AND " + f.Column + " >= $" + fmt.Sprintf("%d", argn)
				*args = append(*args, p.DateFrom)
			}
		case "date_to":
			if p.DateTo != "" {
				*where += " AND " + f.Column + " <= $" + fmt.Sprintf("%d", argn)
				*args = append(*args, p.DateTo)
			}
		}
	}
}

func GridUIx(id, title string, filters []DateFilter, columns []string) map[string]any {
	ui := map[string]any{
		"id":      id,
		"title":   title,
		"filters": filters,
		"columns": columns,
	}
	return ui
}

func EnableDateFilter(filters []DateFilter, col string) []DateFilter {
	for i := range filters {
		if filters[i].Column == col {
			filters[i].Enabled = true
			return filters
		}
	}
	return filters
}

func DisableDateFilter(filters []DateFilter, col string) []DateFilter {
	for i := range filters {
		if filters[i].Column == col {
			filters[i].Enabled = false
			return filters
		}
	}
	return filters
}
