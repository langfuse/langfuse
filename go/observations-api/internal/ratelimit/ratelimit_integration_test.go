package ratelimit

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/langfuse/langfuse/go/observations-api/internal/auth"
)

// TestSharedCounterWithNodeStack verifies the fixed-window counter is
// interoperable with rate-limiter-flexible's Redis layout (plain integer at
// rate-limit:<resource>:<orgId> with a window TTL): both stacks increment
// the same key, so split traffic shares one budget.
//
// Requires Redis; set OBSERVATIONS_API_REDIS_ADDR (e.g. 127.0.0.1:6379) and
// optionally OBSERVATIONS_API_REDIS_AUTH to run.
func TestSharedCounterWithNodeStack(t *testing.T) {
	addr := os.Getenv("OBSERVATIONS_API_REDIS_ADDR")
	if addr == "" {
		t.Skip("OBSERVATIONS_API_REDIS_ADDR not set")
	}

	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: addr, Password: os.Getenv("OBSERVATIONS_API_REDIS_AUTH")})
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Fatalf("redis not reachable: %v", err)
	}

	orgID := "go-interop-test-org"
	key := "rate-limit:public-api:" + orgID
	defer rdb.Del(ctx, key)

	// Simulate three prior consumptions by the Node stack (rate-limiter-
	// flexible: INCRBY + PEXPIRE window).
	rdb.Del(ctx, key)
	rdb.IncrBy(ctx, key, 3)
	rdb.PExpire(ctx, key, 60*time.Second)

	points := 10
	duration := 60
	svc := NewService(rdb, "", "test-region", true, slog.Default())
	scope := &auth.Scope{
		OrgID: orgID,
		Plan:  "cloud:hobby",
		RateLimitOverrides: []auth.RateLimitOverride{
			{Resource: "public-api", Points: &points, DurationInSec: &duration},
		},
	}

	res := svc.Check(ctx, scope)
	if res == nil {
		t.Fatal("expected a rate limit result")
	}
	// Node consumed 3, this is the 4th within the same window.
	if res.RemainingPoints != 6 {
		t.Errorf("remainingPoints = %d, want 6 (shared counter)", res.RemainingPoints)
	}
	if res.Limited {
		t.Error("must not be limited at 4/10")
	}

	// Exhaust the budget; parity quirk: rate-limiter-flexible's
	// isRateLimited() triggers at remainingPoints < 1, i.e. the request that
	// consumes the last point is already limited.
	var last *Result
	for i := 0; i < 6; i++ {
		last = svc.Check(ctx, scope)
	}
	if last == nil || !last.Limited {
		t.Errorf("expected limited after exhausting shared budget, got %+v", last)
	}
	if last.MsBeforeNext <= 0 || last.MsBeforeNext > 60_000 {
		t.Errorf("msBeforeNext = %d, want within the 60s window", last.MsBeforeNext)
	}
}

func TestPlanConfigMatrix(t *testing.T) {
	// Pin the public-api bucket to the Node matrix
	// (getPlanBasedRateLimitConfig in RateLimitService.ts).
	unlimited := []string{"oss", "self-hosted:pro", "self-hosted:enterprise", "unknown-plan"}
	for _, plan := range unlimited {
		if cfg := planConfig(plan); cfg.Points != nil {
			t.Errorf("plan %s must be unlimited", plan)
		}
	}
	limits := map[string]int{
		"cloud:hobby": 30, "cloud:core": 1000, "cloud:pro": 1000, "cloud:team": 1000, "cloud:enterprise": 1000,
	}
	for plan, want := range limits {
		cfg := planConfig(plan)
		if cfg.Points == nil || *cfg.Points != want || cfg.DurationInSec == nil || *cfg.DurationInSec != 60 {
			t.Errorf("plan %s: got %+v, want %d/60s", plan, cfg, want)
		}
	}
}
