package usecase

import "log/slog"

// testLogger — logger senyap untuk unit test.
func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(&nullWriter{}, &slog.HandlerOptions{Level: slog.LevelError}))
}

// nullWriter membuang semua output.
type nullWriter struct{}

func (nullWriter) Write(p []byte) (int, error) { return len(p), nil }
