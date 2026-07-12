// Package auth implements the public-API key verification hot path.
//
// Fast path (>99% of requests): compute the salted SHA-256 fast hash of the
// secret key and resolve the cached OrgEnrichedApiKey JSON from Redis — the
// exact cache the Node ApiAuthService maintains (`api-key:<fastHash>` with a
// sliding TTL via GETEX).
//
// Miss path: delegate to the Node web service's internal verify endpoint,
// which runs the full ApiAuthService flow (bcrypt legacy keys, fast-hash
// upgrade writes, plan resolution from cloudConfig) and warms the shared
// Redis cache as a side effect. This service intentionally implements no
// bcrypt and no Postgres auth queries.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	apiKeyCachePrefix = "api-key:"
	// Sentinel stored by Node for unknown keys (negative cache).
	apiKeyNonExistent = "api-key-non-existent"

	// Error messages must match ApiAuthService exactly.
	errNoAuthHeader        = "No authorization header"
	errHostSuffix          = ". Confirm that you've configured the correct host."
	errInvalidCredentials  = "Invalid credentials" + errHostSuffix
	errInvalidAuthHeader   = "Invalid authorization header" + errHostSuffix
	errUnsupportedHeader   = "Invalid authorization header"
	errInAppAgentKeyDenied = "Access denied - in-app agent keys are not allowed for this endpoint"
)

// RateLimitOverride mirrors CloudConfigRateLimit entries stored on the org.
type RateLimitOverride struct {
	Resource      string `json:"resource"`
	Points        *int   `json:"points"`
	DurationInSec *int   `json:"durationInSec"`
}

// Scope mirrors the Node ApiAccessScope for project-scoped keys.
type Scope struct {
	ProjectID            string              `json:"projectId"`
	AccessLevel          string              `json:"accessLevel"`
	OrgID                string              `json:"orgId"`
	Plan                 string              `json:"plan"`
	RateLimitOverrides   []RateLimitOverride `json:"rateLimitOverrides"`
	APIKeyID             string              `json:"apiKeyId"`
	PublicKey            string              `json:"publicKey"`
	IsIngestionSuspended *bool               `json:"isIngestionSuspended"`
	IsInAppAgentKey      bool                `json:"isInAppAgentKey"`
}

// cachedAPIKey is the subset of the OrgEnrichedApiKey cache JSON we need.
// (packages/shared/src/server/auth/types.ts)
type cachedAPIKey struct {
	ID                   string              `json:"id"`
	PublicKey            string              `json:"publicKey"`
	FastHashedSecretKey  string              `json:"fastHashedSecretKey"`
	OrgID                string              `json:"orgId"`
	Plan                 string              `json:"plan"`
	RateLimitOverrides   []RateLimitOverride `json:"rateLimitOverrides"`
	IsIngestionSuspended *bool               `json:"isIngestionSuspended"`
	IsInAppAgentKey      *bool               `json:"isInAppAgentKey"`
	Scope                string              `json:"scope"`
	ProjectID            *string             `json:"projectId"`
}

// AuthFailure carries the HTTP status and message for a failed verification,
// matching verifyApiKeyAuth in createAuthedProjectAPIRoute.ts.
type AuthFailure struct {
	Status  int
	Message string
}

func (e *AuthFailure) Error() string { return e.Message }

// ErrDelegateUnavailable signals the miss-path delegate could not be reached;
// callers map this to 503 Service Unavailable (Node's Prisma-down behavior).
var ErrDelegateUnavailable = errors.New("auth delegate unavailable")

type Service struct {
	redis          *redis.Client
	keyPrefix      string
	cacheEnabled   bool
	cacheTTL       time.Duration
	salt           string
	webURL         string
	internalSecret string
	httpClient     *http.Client
	logger         *slog.Logger
}

func NewService(rdb *redis.Client, keyPrefix string, cacheEnabled bool, cacheTTLSecs int, salt, webURL, internalSecret string, logger *slog.Logger) *Service {
	return &Service{
		redis:          rdb,
		keyPrefix:      keyPrefix,
		cacheEnabled:   cacheEnabled,
		cacheTTL:       time.Duration(cacheTTLSecs) * time.Second,
		salt:           salt,
		webURL:         strings.TrimRight(webURL, "/"),
		internalSecret: internalSecret,
		httpClient:     &http.Client{Timeout: 10 * time.Second},
		logger:         logger,
	}
}

// FastHash replicates createShaHash (packages/shared/src/server/auth/apiKeys.ts):
// sha256_hex( secretKey_bytes ++ hex(sha256(salt)) )
func FastHash(secretKey, salt string) string {
	saltDigest := sha256.Sum256([]byte(salt))
	saltHex := hex.EncodeToString(saltDigest[:])

	h := sha256.New()
	h.Write([]byte(secretKey))
	h.Write([]byte(saltHex))
	return hex.EncodeToString(h.Sum(nil))
}

// Verify authenticates the Authorization header for a project-scoped route
// with allowInAppAgentKey=true semantics (the v2 observations route config).
func (s *Service) Verify(ctx context.Context, authHeader string) (*Scope, error) {
	if authHeader == "" {
		return nil, &AuthFailure{Status: 401, Message: errNoAuthHeader}
	}

	if !strings.HasPrefix(authHeader, "Basic ") {
		if strings.HasPrefix(authHeader, "Bearer ") {
			// Bearer resolves to accessLevel "scores", which this route does
			// not accept. Delegate for exact parity of unknown-key errors is
			// unnecessary: valid Bearer keys are rejected with 403 either way,
			// and invalid ones with 401. We short-circuit valid+invalid alike
			// through the delegate to keep messages identical.
			return s.delegate(ctx, authHeader)
		}
		return nil, &AuthFailure{Status: 401, Message: errUnsupportedHeader}
	}

	publicKey, secretKey, parseErr := parseBasicAuth(authHeader)
	if parseErr != nil {
		return nil, parseErr
	}
	_ = publicKey

	hash := FastHash(secretKey, s.salt)

	if s.cacheEnabled && s.redis != nil {
		val, err := s.redis.GetEx(ctx, s.keyPrefix+apiKeyCachePrefix+hash, s.cacheTTL).Result()
		switch {
		case err == nil:
			if val == apiKeyNonExistent {
				return nil, &AuthFailure{Status: 401, Message: errInvalidCredentials}
			}
			var cached cachedAPIKey
			if jsonErr := json.Unmarshal([]byte(val), &cached); jsonErr == nil && cached.ID != "" {
				return s.scopeFromCache(&cached)
			}
			// Unparsable cache entry: drop it and fall through to delegate,
			// matching Node's fetchApiKeyFromRedis behavior.
			s.redis.Del(ctx, s.keyPrefix+apiKeyCachePrefix+hash)
		case errors.Is(err, redis.Nil):
			// miss: fall through to delegate
		default:
			s.logger.Warn("redis api key cache read failed", "error", err)
			// Redis unavailable: fall through to delegate (Node falls back to
			// Postgres in this situation).
		}
	}

	return s.delegate(ctx, authHeader)
}

func (s *Service) scopeFromCache(cached *cachedAPIKey) (*Scope, error) {
	// In-app agent keys are allowed on this route (allowInAppAgentKey: true),
	// so no rejection here; field is carried for completeness.
	isInAppAgentKey := cached.IsInAppAgentKey != nil && *cached.IsInAppAgentKey

	accessLevel := "project"
	if cached.Scope == "ORGANIZATION" {
		accessLevel = "organization"
	}

	scope := &Scope{
		AccessLevel:          accessLevel,
		OrgID:                cached.OrgID,
		Plan:                 cached.Plan,
		RateLimitOverrides:   cached.RateLimitOverrides,
		APIKeyID:             cached.ID,
		PublicKey:            cached.PublicKey,
		IsIngestionSuspended: cached.IsIngestionSuspended,
		IsInAppAgentKey:      isInAppAgentKey,
	}
	if cached.ProjectID != nil {
		scope.ProjectID = *cached.ProjectID
	}

	return checkProjectAccess(scope)
}

// checkProjectAccess applies the route-level access rules of
// createAuthedProjectAPIRoute with allowedAccessLevels=["project"].
func checkProjectAccess(scope *Scope) (*Scope, error) {
	if scope.AccessLevel != "project" {
		return nil, &AuthFailure{
			Status:  403,
			Message: "Access denied - insufficient permissions for this endpoint",
		}
	}
	if scope.ProjectID == "" {
		return nil, &AuthFailure{
			Status:  403,
			Message: "Project ID not found for API token. Are you using an organization key?",
		}
	}
	return scope, nil
}

// verifyResponse is the wire format of the internal verify endpoint.
type verifyResponse struct {
	ValidKey bool    `json:"validKey"`
	Error    *string `json:"error"`
	Scope    *struct {
		ProjectID            *string             `json:"projectId"`
		AccessLevel          string              `json:"accessLevel"`
		OrgID                string              `json:"orgId"`
		Plan                 string              `json:"plan"`
		RateLimitOverrides   []RateLimitOverride `json:"rateLimitOverrides"`
		APIKeyID             string              `json:"apiKeyId"`
		PublicKey            string              `json:"publicKey"`
		IsIngestionSuspended *bool               `json:"isIngestionSuspended"`
		IsInAppAgentKey      *bool               `json:"isInAppAgentKey"`
	} `json:"scope"`
}

// delegate performs the miss-path verification through the Node web service.
func (s *Service) delegate(ctx context.Context, authHeader string) (*Scope, error) {
	if s.webURL == "" || s.internalSecret == "" {
		s.logger.Error("auth delegation not configured (LANGFUSE_WEB_INTERNAL_URL / LANGFUSE_INTERNAL_API_SECRET)")
		return nil, ErrDelegateUnavailable
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.webURL+"/api/internal/verify-api-key?allowInAppAgentKey=true", nil)
	if err != nil {
		return nil, ErrDelegateUnavailable
	}
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("x-langfuse-internal-secret", s.internalSecret)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.logger.Error("auth delegate request failed", "error", err)
		return nil, ErrDelegateUnavailable
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		s.logger.Error("auth delegate returned non-200", "status", resp.StatusCode, "body", string(body))
		return nil, ErrDelegateUnavailable
	}

	var vr verifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return nil, ErrDelegateUnavailable
	}

	if !vr.ValidKey {
		msg := "Authentication failed"
		if vr.Error != nil {
			msg = *vr.Error
		}
		return nil, &AuthFailure{Status: 401, Message: msg}
	}
	if vr.Scope == nil {
		return nil, ErrDelegateUnavailable
	}

	scope := &Scope{
		AccessLevel:          vr.Scope.AccessLevel,
		OrgID:                vr.Scope.OrgID,
		Plan:                 vr.Scope.Plan,
		RateLimitOverrides:   vr.Scope.RateLimitOverrides,
		APIKeyID:             vr.Scope.APIKeyID,
		PublicKey:            vr.Scope.PublicKey,
		IsIngestionSuspended: vr.Scope.IsIngestionSuspended,
		IsInAppAgentKey:      vr.Scope.IsInAppAgentKey != nil && *vr.Scope.IsInAppAgentKey,
	}
	if vr.Scope.ProjectID != nil {
		scope.ProjectID = *vr.Scope.ProjectID
	}

	return checkProjectAccess(scope)
}

// parseBasicAuth replicates extractBasicAuthCredentials + atob semantics.
// Error messages match the Node ApiAuthService (atob throws "Invalid
// character" for non-base64 input; structural problems yield "Invalid
// authorization header"; both get the host-hint suffix).
func parseBasicAuth(header string) (publicKey, secretKey string, failure *AuthFailure) {
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", "", &AuthFailure{Status: 401, Message: errInvalidAuthHeader}
	}

	decoded, err := atob(parts[1])
	if err != nil {
		return "", "", &AuthFailure{Status: 401, Message: "Invalid character" + errHostSuffix}
	}

	// Node: atob(x).split(":") — the password is the second segment only,
	// discarding anything after a further colon.
	segments := strings.Split(decoded, ":")
	if len(segments) < 2 || segments[0] == "" || segments[1] == "" {
		return "", "", &AuthFailure{Status: 401, Message: errInvalidAuthHeader}
	}
	return segments[0], segments[1], nil
}

// atob mirrors the WHATWG forgiving-base64 decode Node implements: ASCII
// whitespace is stripped, padding is optional, and any other non-alphabet
// character throws InvalidCharacterError("Invalid character").
func atob(s string) (string, error) {
	var cleaned strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f':
			// strip ASCII whitespace
		case (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=':
			cleaned.WriteByte(c)
		default:
			return "", fmt.Errorf("invalid character")
		}
	}
	body := strings.TrimRight(cleaned.String(), "=")
	if len(body)%4 == 1 {
		return "", fmt.Errorf("invalid character")
	}
	decoded, err := base64.RawStdEncoding.DecodeString(body)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}

// CacheKeyForHash exposes the Redis key layout for tests.
func CacheKeyForHash(keyPrefix, hash string) string {
	return fmt.Sprintf("%s%s%s", keyPrefix, apiKeyCachePrefix, hash)
}
