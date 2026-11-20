//go:build linux

package jobs

import (
	"context"
	"errors"
)

func (r *Runner) diagnostic(ctx context.Context, command, service string) (string, error) {
	env := []string{"LANG=C"}
	switch command {
	case "uptime":
		return runCommand(ctx, env, "/usr/bin/uptime")
	case "df":
		return runCommand(ctx, env, "/usr/bin/df", "-P", "/")
	case "docker ps":
		env = append(env, "DOCKER_HOST=unix:///var/run/docker.sock")
		return runCommand(ctx, env, "/usr/bin/docker", "ps")
	case "systemctl status":
		return runCommand(ctx, env, "/usr/bin/systemctl", "status", "--no-pager", "--lines=0", "--", service)
	}
	return "", errors.New("unsupported diagnostic command")
}
