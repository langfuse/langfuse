package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// tokenSource returns the JWT to send on a connection opened now.
type tokenSource func(ctx context.Context) (string, error)

const (
	tokenRequestTimeout = 10 * time.Second
	// Renew this long before expiry, or at half the remaining lifetime if
	// that is sooner.
	tokenRenewalMargin = 5 * time.Minute
	// Lifetime assumed when the token endpoint reports none and the token is
	// opaque.
	defaultTokenLifetime = 5 * time.Minute
)

// newTokenSource selects the token source from the environment. It follows the
// rules the Langfuse containers apply to CLICKHOUSE_AUTH_MODE=jwt: exactly one
// of the three sources is set.
func newTokenSource(getenv func(string) string, httpClient *http.Client) (tokenSource, error) {
	var sources []string
	for _, name := range []string{"CLICKHOUSE_JWT_TOKEN", "CLICKHOUSE_JWT_TOKEN_FILE", "CLICKHOUSE_JWT_TOKEN_URL"} {
		if getenv(name) != "" {
			sources = append(sources, name)
		}
	}
	if len(sources) != 1 {
		found := "none"
		if len(sources) > 0 {
			found = strings.Join(sources, ", ")
		}
		return nil, fmt.Errorf("CLICKHOUSE_AUTH_MODE jwt needs exactly one of CLICKHOUSE_JWT_TOKEN, CLICKHOUSE_JWT_TOKEN_FILE or CLICKHOUSE_JWT_TOKEN_URL, found %s", found)
	}

	switch sources[0] {
	case "CLICKHOUSE_JWT_TOKEN":
		token := getenv("CLICKHOUSE_JWT_TOKEN")
		return func(context.Context) (string, error) { return token, nil }, nil
	case "CLICKHOUSE_JWT_TOKEN_FILE":
		return fileTokenSource(getenv("CLICKHOUSE_JWT_TOKEN_FILE")), nil
	}

	source := &clientCredentials{
		tokenURL:         getenv("CLICKHOUSE_JWT_TOKEN_URL"),
		clientID:         getenv("CLICKHOUSE_JWT_CLIENT_ID"),
		clientSecret:     getenv("CLICKHOUSE_JWT_CLIENT_SECRET"),
		clientSecretFile: getenv("CLICKHOUSE_JWT_CLIENT_SECRET_FILE"),
		authMethod:       getenv("CLICKHOUSE_JWT_CLIENT_AUTH_METHOD"),
		scope:            getenv("CLICKHOUSE_JWT_SCOPE"),
		audience:         getenv("CLICKHOUSE_JWT_AUDIENCE"),
		httpClient:       httpClient,
		now:              time.Now,
	}
	if source.clientID == "" {
		return nil, errors.New("CLICKHOUSE_JWT_CLIENT_ID is required when CLICKHOUSE_JWT_TOKEN_URL is set")
	}
	if (source.clientSecret == "") == (source.clientSecretFile == "") {
		return nil, errors.New("CLICKHOUSE_JWT_TOKEN_URL needs exactly one of CLICKHOUSE_JWT_CLIENT_SECRET or CLICKHOUSE_JWT_CLIENT_SECRET_FILE")
	}
	// The request carries the client secret and the response the token.
	if !isSecureTokenURL(source.tokenURL) {
		return nil, errors.New("CLICKHOUSE_JWT_TOKEN_URL must use https, except on localhost")
	}
	switch source.authMethod {
	case "":
		source.authMethod = "client_secret_basic"
	case "client_secret_basic", "client_secret_post":
	default:
		return nil, errors.New("CLICKHOUSE_JWT_CLIENT_AUTH_METHOD must be client_secret_basic or client_secret_post")
	}
	return source.token, nil
}

// isSecureTokenURL accepts https, and plain http only on the local host.
func isSecureTokenURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	switch parsed.Scheme {
	case "https":
		return true
	case "http":
		host := parsed.Hostname()
		return host == "localhost" || host == "127.0.0.1" || host == "::1"
	}
	return false
}

// fileTokenSource reads the file on every call, so a token the platform renews
// in place is picked up.
func fileTokenSource(path string) tokenSource {
	return func(context.Context) (string, error) {
		content, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("cannot read ClickHouse token file: %w", err)
		}
		token := strings.TrimSpace(string(content))
		if token == "" {
			return "", fmt.Errorf("ClickHouse token file %s is empty", path)
		}
		return token, nil
	}
}

// clientCredentials obtains tokens with the OAuth 2.0 client credentials grant
// (RFC 6749, section 4.4) and reuses each one until shortly before it expires.
type clientCredentials struct {
	tokenURL, clientID, authMethod, scope, audience string
	// Exactly one of the two is set. The file is read for every token request,
	// so a secret the platform rotates is picked up.
	clientSecret, clientSecretFile string
	httpClient                     *http.Client
	now                            func() time.Time

	mu      sync.Mutex
	cached  string
	renewAt time.Time
}

func (c *clientCredentials) token(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cached != "" && c.now().Before(c.renewAt) {
		return c.cached, nil
	}

	token, lifetime, err := c.request(ctx)
	if err != nil {
		return "", err
	}
	c.cached = token
	c.renewAt = c.now().Add(lifetime - min(tokenRenewalMargin, lifetime/2))
	return token, nil
}

func (c *clientCredentials) secret() (string, error) {
	if c.clientSecretFile == "" {
		return c.clientSecret, nil
	}
	content, err := os.ReadFile(c.clientSecretFile)
	if err != nil {
		return "", fmt.Errorf("cannot read ClickHouse client secret file: %w", err)
	}
	secret := strings.TrimSpace(string(content))
	if secret == "" {
		return "", fmt.Errorf("ClickHouse client secret file %s is empty", c.clientSecretFile)
	}
	return secret, nil
}

func (c *clientCredentials) request(ctx context.Context) (string, time.Duration, error) {
	clientSecret, err := c.secret()
	if err != nil {
		return "", 0, err
	}
	form := url.Values{"grant_type": {"client_credentials"}}
	if c.scope != "" {
		form.Set("scope", c.scope)
	}
	if c.audience != "" {
		form.Set("audience", c.audience)
	}
	if c.authMethod == "client_secret_post" {
		form.Set("client_id", c.clientID)
		form.Set("client_secret", clientSecret)
	}

	ctx, cancel := context.WithTimeout(ctx, tokenRequestTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", 0, errors.New("CLICKHOUSE_JWT_TOKEN_URL is not a valid URL")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	if c.authMethod == "client_secret_basic" {
		// RFC 6749, section 2.3.1: form-encode both parts before joining.
		request.SetBasicAuth(formEncode(c.clientID), formEncode(clientSecret))
	}

	client := *c.httpClient
	// A redirect must not carry the client secret to another host.
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return errors.New("the token endpoint redirected the request")
	}
	response, err := client.Do(request)
	if err != nil {
		return "", 0, fmt.Errorf("ClickHouse access token request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		// The body is not reported: token endpoint errors can echo the request.
		return "", 0, fmt.Errorf("token endpoint responded with status %d", response.StatusCode)
	}

	var body struct {
		AccessToken string `json:"access_token"`
		// Seconds. Optional in RFC 6749, section 5.1.
		ExpiresIn json.Number `json:"expires_in"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil || body.AccessToken == "" {
		return "", 0, errors.New("token endpoint returned a response without an access_token")
	}

	if seconds, err := body.ExpiresIn.Float64(); err == nil && seconds > 0 {
		return body.AccessToken, time.Duration(seconds * float64(time.Second)), nil
	}
	if expiry, ok := jwtExpiry(body.AccessToken); ok && expiry.After(c.now()) {
		return body.AccessToken, expiry.Sub(c.now()), nil
	}
	return body.AccessToken, defaultTokenLifetime, nil
}

// formEncode encodes a space as %20, as the Langfuse containers do for the
// same credentials.
func formEncode(value string) string {
	return strings.ReplaceAll(url.QueryEscape(value), "+", "%20")
}

// jwtExpiry reads the exp claim without verifying the signature. It only
// decides when to request a new token, never whether to trust one.
func jwtExpiry(token string) (time.Time, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return time.Time{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, false
	}
	var claims struct {
		Exp float64 `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Exp <= 0 {
		return time.Time{}, false
	}
	return time.Unix(int64(claims.Exp), 0), true
}
