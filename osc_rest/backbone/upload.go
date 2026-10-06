package backbone

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"osc_rest/mechanic"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	MaxUploadSize = 20 << 20
	UploadBase    = "/root/files"
)

var allowedExtensions = map[string]bool{
	".pdf": true, ".doc": true, ".docx": true,
	".png": true, ".jpg": true, ".jpeg": true,
	".xlsx": true, ".csv": true, ".txt": true,
}

func UploadHandler(c *gin.Context) {
	category := c.Param("category")
	entityID := c.Param("id")
	if category == "" || entityID == "" {
		mechanic.Error(c, mechanic.ValidationError("Category and ID are required"))
		return
	}
	if category != "documents" && category != "evidence" && category != "avatars" {
		mechanic.Error(c, mechanic.ValidationError("Category must be documents, evidence, or avatars"))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxUploadSize)
	file, err := c.FormFile("file")
	if err != nil {
		mechanic.Error(c, mechanic.ValidationError("File is required or exceeds 20MB limit"))
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		mechanic.Error(c, mechanic.ValidationError("File type not allowed"))
		return
	}
	dir := filepath.Join(UploadBase, category, entityID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to create upload directory", err))
		return
	}
	filename := fmt.Sprintf("%s_%d%s", uuid.New().String()[:8], time.Now().UnixMilli(), ext)
	savePath := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		mechanic.Error(c, mechanic.InternalError("Failed to save file", err))
		return
	}
	relativePath := fmt.Sprintf("/files/%s/%s/%s", category, entityID, filename)
	c.JSON(http.StatusOK, gin.H{
		"message":   "File uploaded successfully",
		"file_path": relativePath,
		"filename":  file.Filename,
		"size":      file.Size,
	})
}
