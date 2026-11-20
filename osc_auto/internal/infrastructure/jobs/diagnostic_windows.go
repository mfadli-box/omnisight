//go:build windows

package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func (r *Runner) diagnostic(ctx context.Context, command, service string) (string, error) {
	switch command {
	case "uptime", "df":
		sample, err := r.sampler.Sample(ctx)
		if err != nil {
			return "", err
		}
		if command == "uptime" {
			return fmt.Sprintf("uptime_seconds=%d", sample.UptimeSeconds), nil
		}
		return fmt.Sprintf("disk_total_bytes=%d disk_used_bytes=%d", sample.DiskTotal, sample.DiskUsed), nil
	case "docker ps":
		programFiles, err := windows.KnownFolderPath(windows.FOLDERID_ProgramFiles, 0)
		if err != nil {
			return "", err
		}
		env := []string{"SystemRoot=" + os.Getenv("SystemRoot"), "DOCKER_HOST=npipe:////./pipe/docker_engine"}
		binary := filepath.Join(programFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
		return runCommand(ctx, env, binary, "ps")
	case "systemctl status":
		return queryService(ctx, service)
	}
	return "", errors.New("unsupported diagnostic command")
}
