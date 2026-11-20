//go:build windows

package jobs

import (
	"context"
	"errors"
	"os/exec"
	"strings"
)

func serviceStatus(ctx context.Context, name string) (string, error) {
	cmd := exec.CommandContext(ctx, `C:\Windows\System32\sc.exe`, "query", name)
	data, err := cmd.Output()
	output := strings.TrimSpace(string(data))
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return bounded(output), nil
		}
		return bounded(output), err
	}
	return bounded(output), nil
}
