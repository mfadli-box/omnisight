//go:build windows

package jobs

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func serviceStatus(ctx context.Context, name string) (string, error) {
	output, err := queryService(ctx, name)
	if ctx.Err() != nil {
		return output, ctx.Err()
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return output, nil
		}
		return output, err
	}
	return output, nil
}

func queryService(ctx context.Context, name string) (string, error) {
	systemDir, err := windows.GetSystemDirectory()
	if err != nil {
		return "", err
	}
	env := []string{"SystemRoot=" + filepath.Dir(systemDir)}
	return runCommand(ctx, env, filepath.Join(systemDir, "sc.exe"), "query", name)
}
