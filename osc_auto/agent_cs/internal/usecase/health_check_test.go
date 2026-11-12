package usecase_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/usecase"
)

// fakeProbe — stub domain.RustAPIProbe untuk unit test (tidak ada I/O).
type fakeProbe struct {
	health domain.ServiceHealth
	err    error
}

func (f *fakeProbe) ProbeHealth(context.Context) (domain.ServiceHealth, error) {
	return f.health, f.err
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
}

func TestRunOnceHealthy(t *testing.T) {
	checker := usecase.NewHealthChecker(&fakeProbe{
		health: domain.ServiceHealth{Service: "osc_rest", Status: "ok", Reachable: true},
	}, testLogger())

	health, err := checker.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("tidak boleh error: %v", err)
	}
	if !health.Reachable || health.Status != "ok" || health.Service != "osc_rest" {
		t.Fatalf("snapshot tidak sesuai: %+v", health)
	}
}

func TestRunOnceUnreachable(t *testing.T) {
	checker := usecase.NewHealthChecker(&fakeProbe{
		err: domain.ErrUnreachable,
	}, testLogger())

	health, err := checker.RunOnce(context.Background())
	if !errors.Is(err, domain.ErrUnreachable) {
		t.Fatalf("harus errors.Is(ErrUnreachable), dapat: %v", err)
	}
	if health.Reachable || health.Status != "down" {
		t.Fatalf("snapshot gagal harus unreachable/down: %+v", health)
	}
}
