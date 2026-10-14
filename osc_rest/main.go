package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"osc_rest/backbone"
	"osc_rest/mechanic"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	if err := mechanic.InitCrypto(); err != nil {
		backbone.Log.Fatal().Err(err).Msg("crypto initialization failed")
	}
	backbone.SetDatabase()
	rest := backbone.SetRouter()
	go backbone.CleanupExpiredSessions()
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:37772"
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           rest,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
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
