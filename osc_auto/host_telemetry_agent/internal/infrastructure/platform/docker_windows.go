//go:build windows

// Dialer Docker Engine API Windows — named pipe \\.\pipe\docker_engine
// (via github.com/Microsoft/go-winio, murni userspace).
package platform

import (
	"context"
	"net"

	winio "github.com/Microsoft/go-winio"
)

// defaultNamedPipe — named pipe Engine API Windows.
const defaultNamedPipe = `\\.\pipe\docker_engine`

// dockerDialContext mengembalikan dialer ke named pipe Docker.
func dockerDialContext(socketPath string) func(ctx context.Context, network, addr string) (net.Conn, error) {
	if socketPath == "" {
		socketPath = defaultNamedPipe
	}
	return func(ctx context.Context, _, _ string) (net.Conn, error) {
		return winio.DialPipeContext(ctx, socketPath)
	}
}
