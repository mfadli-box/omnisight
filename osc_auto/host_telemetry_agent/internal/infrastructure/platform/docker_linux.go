//go:build linux

// Dialer Docker Engine API Linux — unix domain socket
// (/var/run/docker.sock default, dioverride via HOST_TELEMETRY_DOCKER_SOCKET).
package platform

import (
	"context"
	"net"
)

// defaultUnixSocket — socket Engine API Linux.
const defaultUnixSocket = "/var/run/docker.sock"

// dockerDialContext mengembalikan dialer ke unix socket Docker.
func dockerDialContext(socketPath string) func(ctx context.Context, network, addr string) (net.Conn, error) {
	if socketPath == "" {
		socketPath = defaultUnixSocket
	}
	return func(ctx context.Context, _, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "unix", socketPath)
	}
}
