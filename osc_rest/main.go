package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"osc_rest/backbone"
)

func main() {
	backbone.SetDatabase()
	rest := backbone.SetRouter()
	go backbone.CleanupExpiredSessions()
	srv := &http.Server{
		Addr:    ":37772",
		Handler: rest,
	}
	go func() {
		backbone.Log.Info().Str("addr", srv.Addr).Msg("server starting")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			backbone.Log.Fatal().Err(err).Msg("server failed to start")
		}
	}()
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	backbone.Log.Info().Msg("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		backbone.Log.Fatal().Err(err).Msg("server forced to shutdown")
	}
	backbone.PgSQL.Close()
	backbone.Log.Info().Msg("server exited cleanly")
}
