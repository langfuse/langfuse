// Package config loads service configuration from the same environment
// variables the Node.js web service uses, so the container is a drop-in
// sidecar in existing deployments.
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	// Server
	Port string

	// Feature gating (must match web: v2 observations API is preview-gated)
	V4PreviewOptIn bool

	// Auth
	Salt               string
	APIKeyCacheEnabled bool
	APIKeyCacheTTLSecs int
	RedisKeyPrefix     string
	WebInternalURL     string // base URL of the Node web service for auth-miss delegation
	InternalAPISecret  string // shared secret for the internal verify endpoint
	CloudRegion        string // NEXT_PUBLIC_LANGFUSE_CLOUD_REGION; empty = self-hosted
	RateLimitsEnabled  bool

	// ClickHouse
	ClickhouseURL      string // native (clickhouse://) or HTTP (http(s)://) URL
	ClickhouseUser     string
	ClickhousePassword string
	ClickhouseDB       string

	// Postgres
	DatabaseURL string

	// Redis
	RedisHost string
	RedisPort string
	RedisAuth string
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// Load reads configuration from the environment. It returns an error for
// missing required variables so the container fails fast on misconfiguration.
func Load() (*Config, error) {
	c := &Config{
		Port:               getenv("PORT", "3210"),
		V4PreviewOptIn:     os.Getenv("LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN") == "true",
		Salt:               os.Getenv("SALT"),
		APIKeyCacheEnabled: getenv("LANGFUSE_CACHE_API_KEY_ENABLED", "true") == "true",
		RedisKeyPrefix:     os.Getenv("REDIS_KEY_PREFIX"),
		WebInternalURL:     os.Getenv("LANGFUSE_WEB_INTERNAL_URL"),
		InternalAPISecret:  os.Getenv("LANGFUSE_INTERNAL_API_SECRET"),
		CloudRegion:        os.Getenv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"),
		RateLimitsEnabled:  getenv("LANGFUSE_RATE_LIMITS_ENABLED", "true") != "false",
		ClickhouseURL:      getenv("CLICKHOUSE_NATIVE_URL", getenv("CLICKHOUSE_URL", "http://localhost:8123")),
		ClickhouseUser:     getenv("CLICKHOUSE_USER", "default"),
		ClickhousePassword: os.Getenv("CLICKHOUSE_PASSWORD"),
		ClickhouseDB:       getenv("CLICKHOUSE_DB", "default"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		RedisHost:          getenv("REDIS_HOST", "127.0.0.1"),
		RedisPort:          getenv("REDIS_PORT", "6379"),
		RedisAuth:          os.Getenv("REDIS_AUTH"),
	}

	ttl := getenv("LANGFUSE_CACHE_API_KEY_TTL_SECONDS", "300")
	ttlInt, err := strconv.Atoi(ttl)
	if err != nil || ttlInt <= 0 {
		return nil, fmt.Errorf("invalid LANGFUSE_CACHE_API_KEY_TTL_SECONDS: %q", ttl)
	}
	c.APIKeyCacheTTLSecs = ttlInt

	if c.Salt == "" {
		return nil, fmt.Errorf("SALT is required")
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return c, nil
}
