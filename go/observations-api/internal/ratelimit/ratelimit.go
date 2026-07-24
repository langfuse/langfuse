// Package ratelimit implements the fixed-window rate limiter compatible with
// the Node stack's rate-limiter-flexible RateLimiterRedis counters, so limits
// are shared when both services handle traffic for the same org.
//
// Redis layout (matching web/src/features/public-api/server/RateLimitService.ts):
//
//	<REDIS_KEY_PREFIX>rate-limit:<resource>:<orgId>  -> integer counter, TTL = window
package ratelimit

import (
	"context"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/langfuse/langfuse/go/observations-api/internal/auth"
)

const Resource = "public-api"

type Config struct {
	Points        *int
	DurationInSec *int
}

// planConfig mirrors getPlanBasedRateLimitConfig for the "public-api" bucket.
// oss / self-hosted plans are unlimited (nil).
func planConfig(plan string) Config {
	intp := func(v int) *int { return &v }
	switch plan {
	case "cloud:hobby":
		return Config{Points: intp(30), DurationInSec: intp(60)}
	case "cloud:core":
		return Config{Points: intp(1000), DurationInSec: intp(60)} // temporary: pro limit
	case "cloud:pro", "cloud:team", "cloud:enterprise":
		return Config{Points: intp(1000), DurationInSec: intp(60)}
	default:
		// oss, self-hosted:pro, self-hosted:enterprise, unknown
		return Config{}
	}
}

// Result mirrors the fields of rate-limiter-flexible's RateLimiterRes that
// the response contract consumes.
type Result struct {
	Points          int
	RemainingPoints int
	MsBeforeNext    int64
	Limited         bool
}

type Service struct {
	redis     *redis.Client
	keyPrefix string
	enabled   bool // NEXT_PUBLIC_LANGFUSE_CLOUD_REGION set && LANGFUSE_RATE_LIMITS_ENABLED != "false"
	logger    *slog.Logger
}

func NewService(rdb *redis.Client, keyPrefix string, cloudRegion string, rateLimitsEnabled bool, logger *slog.Logger) *Service {
	return &Service{
		redis:     rdb,
		keyPrefix: keyPrefix,
		enabled:   cloudRegion != "" && rateLimitsEnabled,
		logger:    logger,
	}
}

// consumeScript replicates rate-limiter-flexible's counter semantics:
// increment, ensure the window TTL exists, return (consumed, pttl).
var consumeScript = redis.NewScript(`
local consumed = redis.call('INCRBY', KEYS[1], 1)
local pttl = redis.call('PTTL', KEYS[1])
if pttl == -1 or pttl == -2 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return {consumed, pttl}
`)

// Check consumes one point for the org. Returns nil when no limit applies or
// when Redis is unavailable (fail-open, matching Node).
func (s *Service) Check(ctx context.Context, scope *auth.Scope) *Result {
	if !s.enabled || s.redis == nil {
		return nil
	}

	cfg := planConfig(scope.Plan)
	// Org-level overrides win over plan defaults.
	for _, o := range scope.RateLimitOverrides {
		if o.Resource == Resource {
			cfg = Config{Points: o.Points, DurationInSec: o.DurationInSec}
			break
		}
	}
	if cfg.Points == nil || cfg.DurationInSec == nil || *cfg.Points == 0 || *cfg.DurationInSec == 0 {
		return nil
	}

	key := s.keyPrefix + "rate-limit:" + Resource + ":" + scope.OrgID
	windowMs := int64(*cfg.DurationInSec) * 1000

	res, err := consumeScript.Run(ctx, s.redis, []string{key}, windowMs).Int64Slice()
	if err != nil || len(res) != 2 {
		s.logger.Error("rate limit check failed, failing open", "error", err)
		return nil
	}

	consumed, pttl := int(res[0]), res[1]
	remaining := *cfg.Points - consumed
	if remaining < 0 {
		remaining = 0
	}

	return &Result{
		Points:          *cfg.Points,
		RemainingPoints: remaining,
		MsBeforeNext:    pttl,
		// rate-limiter-flexible semantics: limited when remainingPoints < 1.
		Limited: remaining < 1,
	}
}

// RetryAfterSeconds matches Math.ceil(msBeforeNext / 1000).
func (r *Result) RetryAfterSeconds() int64 {
	return (r.MsBeforeNext + 999) / 1000
}

// ResetAt matches new Date(Date.now() + msBeforeNext).
func (r *Result) ResetAt(now time.Time) time.Time {
	return now.Add(time.Duration(r.MsBeforeNext) * time.Millisecond)
}
