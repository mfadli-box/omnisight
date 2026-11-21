package transport

import (
	"context"
	"omnisight/osc_auto/internal/executor"
)

func (c *Client) Containers(ctx context.Context, snapshot executor.Snapshot) error {
	return c.send(ctx, "/baas/v1/agents/containers", snapshot)
}
