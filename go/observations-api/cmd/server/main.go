// observations-api is a Go sidecar service serving GET
// /api/public/v2/observations with the exact contract of the Node.js
// implementation, optimized for high-throughput reads from ClickHouse.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/langfuse/langfuse/go/observations-api/internal/auth"
	"github.com/langfuse/langfuse/go/observations-api/internal/chquery"
	"github.com/langfuse/langfuse/go/observations-api/internal/config"
	"github.com/langfuse/langfuse/go/observations-api/internal/httpapi"
	"github.com/langfuse/langfuse/go/observations-api/internal/ratelimit"
)

// healthcheck probes the local /health endpoint; used as the container
// HEALTHCHECK command (the distroless image has no shell or curl).
func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3210"
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil || resp.StatusCode != http.StatusOK {
		return 1
	}
	_ = resp.Body.Close()
	return 0
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration error", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisHost + ":" + cfg.RedisPort,
		Password: cfg.RedisAuth,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		// Redis being down is not fatal: auth falls back to the delegate and
		// rate limiting fails open, matching the Node behavior.
		logger.Warn("redis not reachable at startup", "error", err)
	}

	chConn, err := chquery.OpenConn(cfg.ClickhouseURL, cfg.ClickhouseUser, cfg.ClickhousePassword, cfg.ClickhouseDB)
	if err != nil {
		logger.Error("clickhouse connection error", "error", err)
		os.Exit(1)
	}
	if err := chConn.Ping(ctx); err != nil {
		logger.Warn("clickhouse not reachable at startup", "error", err)
	}

	pgPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres pool error", "error", err)
		os.Exit(1)
	}

	authSvc := auth.NewService(
		rdb, cfg.RedisKeyPrefix, cfg.APIKeyCacheEnabled, cfg.APIKeyCacheTTLSecs,
		cfg.Salt, cfg.WebInternalURL, cfg.InternalAPISecret, logger,
	)
	rlSvc := ratelimit.NewService(rdb, cfg.RedisKeyPrefix, cfg.CloudRegion, cfg.RateLimitsEnabled, logger)

	handler := httpapi.NewHandler(cfg, authSvc, rlSvc, chConn, pgPool, logger)
	mux := httpapi.NewMux(handler, logger)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("observations-api listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	_ = chConn.Close()
	pgPool.Close()
	_ = rdb.Close()
}
