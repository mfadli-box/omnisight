//go:build linux

package jobs

import (
	"context"
	"errors"
	"os/exec"
	"strings"
)

func serviceStatus(ctx context.Context, name string) (string, error) {
	cmd := exec.CommandContext(ctx, "/usr/bin/systemctl", "is-active", "--", name)
	data, err := cmd.Output()
	status := strings.TrimSpace(string(data))
	if status == "" {
		status = "unknown"
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return bounded(status), nil
		}
		return bounded(status), err
	}
	return bounded(status), nil
}
