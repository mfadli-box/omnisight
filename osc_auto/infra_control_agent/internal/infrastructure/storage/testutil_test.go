package storage

import (
	"context"
	"os"
)

func testCtx() context.Context { return context.Background() }

func readFileBytes(path string) ([]byte, error) {
	return os.ReadFile(path)
}
