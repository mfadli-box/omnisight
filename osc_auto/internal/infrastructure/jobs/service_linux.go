//go:build linux

package jobs

import (
	"context"
	"errors"
	"os/exec"
)

func serviceStatus(ctx context.Context, name string) (string, error) {
	output, err := runCommand(ctx, []string{"LANG=C"}, "/usr/bin/systemctl", "is-active", "--", name)
	if output == "" {
		output = "unknown"
	}
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
