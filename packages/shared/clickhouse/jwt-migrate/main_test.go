package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func environment(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func TestClientCredentialsToken(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		id, secret, _ := r.BasicAuth()
		// The secret arrives form-encoded inside the Basic credentials.
		if id != "langfuse" || secret != "s%3Acret%20%26" {
			t.Errorf("basic auth = %q, %q", id, secret)
		}
		if got := r.PostForm.Encode(); got != "audience=clickhouse&grant_type=client_credentials&scope=ch.write" {
			t.Errorf("form = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": fmt.Sprintf("token-%d", requests.Load()),
			"expires_in":   600,
		})
	}))
	defer server.Close()

	now := time.Unix(1_700_000_000, 0)
	source := &clientCredentials{
		tokenURL: server.URL, clientID: "langfuse", clientSecret: "s:cret &",
		authMethod: "client_secret_basic", scope: "ch.write", audience: "clickhouse",
		httpClient: server.Client(), now: func() time.Time { return now },
	}

	for _, step := range []struct {
		advance time.Duration
		want    string
	}{
		{0, "token-1"},
		// Reused until the renewal margin before expiry.
		{4 * time.Minute, "token-1"},
		{2 * time.Minute, "token-2"},
	} {
		now = now.Add(step.advance)
		got, err := source.token(context.Background())
		if err != nil || got != step.want {
			t.Fatalf("token() = %q, %v, want %q", got, err, step.want)
		}
	}
}

func TestClientCredentialsFailures(t *testing.T) {
	var redirected atomic.Int32
	elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirected.Add(1)
		_, _ = w.Write([]byte(`{"access_token":"token-from-elsewhere","expires_in":600}`))
	}))
	defer elsewhere.Close()

	for name, handler := range map[string]http.HandlerFunc{
		"error status": func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "invalid client_secret=hunter2", http.StatusUnauthorized)
		},
		"redirect": func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, elsewhere.URL, http.StatusTemporaryRedirect)
		},
		"no access_token": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"token_type":"Bearer"}`))
		},
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(handler)
			defer server.Close()
			source := &clientCredentials{
				tokenURL: server.URL, clientID: "langfuse", clientSecret: "hunter2",
				authMethod: "client_secret_post", httpClient: server.Client(), now: time.Now,
			}
			token, err := source.token(context.Background())
			if err == nil {
				t.Fatalf("token() = %q, want an error", token)
			}
			if strings.Contains(err.Error(), "hunter2") {
				t.Errorf("error leaks the client secret: %v", err)
			}
		})
	}
	if redirected.Load() != 0 {
		t.Error("the client secret followed a redirect to another host")
	}
}

func TestClientSecretFileIsReadOnEveryRequest(t *testing.T) {
	var sent []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sent = append(sent, r.PostFormValue("client_secret"))
		_, _ = w.Write([]byte(`{"access_token":"token","expires_in":600}`))
	}))
	defer server.Close()

	path := filepath.Join(t.TempDir(), "client-secret")
	now := time.Unix(1_700_000_000, 0)
	source := &clientCredentials{
		tokenURL: server.URL, clientID: "langfuse", clientSecretFile: path,
		authMethod: "client_secret_post",
		httpClient: server.Client(), now: func() time.Time { return now },
	}

	for _, secret := range []string{"secret-a", "secret-b"} {
		if err := os.WriteFile(path, []byte(secret+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := source.token(context.Background()); err != nil {
			t.Fatal(err)
		}
		// Past the lifetime of the token, so the next call requests a new one.
		now = now.Add(time.Hour)
	}
	if got := strings.Join(sent, ","); got != "secret-a,secret-b" {
		t.Errorf("client secrets sent = %q, want secret-a,secret-b", got)
	}

	if err := os.WriteFile(path, []byte(" \n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := source.token(context.Background()); err == nil {
		t.Error("an empty client secret file returned no error")
	}
}

func TestFileTokenIsReadOnEveryCall(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token")
	source, err := newTokenSource(environment(map[string]string{"CLICKHOUSE_JWT_TOKEN_FILE": path}), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, content := range []string{"token-a\n", "token-b"} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		got, err := source(context.Background())
		if err != nil || got != strings.TrimSpace(content) {
			t.Errorf("token = %q, %v, want %q", got, err, strings.TrimSpace(content))
		}
	}
	if err := os.WriteFile(path, []byte(" \n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := source(context.Background()); err == nil {
		t.Error("an empty token file returned no error")
	}
}

func TestConnectionOptions(t *testing.T) {
	valid := map[string]string{
		"CLICKHOUSE_MIGRATION_URL": "clickhouse://ch.example.com:9440",
		"CLICKHOUSE_MIGRATION_SSL": "true",
		"CLICKHOUSE_DB":            "langfuse",
		"CLICKHOUSE_JWT_TOKEN":     "token-a",
	}
	with := func(overrides map[string]string) map[string]string {
		merged := map[string]string{}
		for name, value := range valid {
			merged[name] = value
		}
		for name, value := range overrides {
			merged[name] = value
		}
		return merged
	}

	options, err := connectionOptions(environment(valid), nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(options.Addr, ","); got != "ch.example.com:9440" {
		t.Errorf("Addr = %q", got)
	}
	if options.Auth.Database != "langfuse" || options.Auth.Username != "" || options.Auth.Password != "" {
		t.Errorf("Auth = %+v, want only the database", options.Auth)
	}
	if options.TLS == nil || options.TLS.InsecureSkipVerify {
		t.Errorf("TLS = %+v, want certificate verification", options.TLS)
	}
	if token, err := options.GetJWT(context.Background()); err != nil || token != "token-a" {
		t.Errorf("GetJWT() = %q, %v", token, err)
	}

	for name, tc := range map[string]struct {
		env  map[string]string
		want string
	}{
		"plain connection":     {with(map[string]string{"CLICKHOUSE_MIGRATION_SSL": "false"}), "CLICKHOUSE_MIGRATION_SSL=true"},
		"credentials in URL":   {with(map[string]string{"CLICKHOUSE_MIGRATION_URL": "clickhouse://user:pass@ch.example.com:9440"}), "must not contain credentials"},
		"HTTP URL":             {with(map[string]string{"CLICKHOUSE_MIGRATION_URL": "https://ch.example.com:8443"}), "clickhouse://host:9440"},
		"no token source":      {with(map[string]string{"CLICKHOUSE_JWT_TOKEN": ""}), "found none"},
		"two token sources":    {with(map[string]string{"CLICKHOUSE_JWT_TOKEN_FILE": "/run/token"}), "found CLICKHOUSE_JWT_TOKEN, CLICKHOUSE_JWT_TOKEN_FILE"},
		"token URL, no client": {with(map[string]string{"CLICKHOUSE_JWT_TOKEN": "", "CLICKHOUSE_JWT_TOKEN_URL": "https://idp.example.com/token"}), "CLICKHOUSE_JWT_CLIENT_ID"},
		"two client secrets":   {with(map[string]string{"CLICKHOUSE_JWT_TOKEN": "", "CLICKHOUSE_JWT_TOKEN_URL": "https://idp.example.com/token", "CLICKHOUSE_JWT_CLIENT_ID": "langfuse", "CLICKHOUSE_JWT_CLIENT_SECRET": "s3cret", "CLICKHOUSE_JWT_CLIENT_SECRET_FILE": "/run/secret"}), "exactly one of CLICKHOUSE_JWT_CLIENT_SECRET"},
		"plain HTTP token URL": {with(map[string]string{"CLICKHOUSE_JWT_TOKEN": "", "CLICKHOUSE_JWT_TOKEN_URL": "http://idp.example.com/token", "CLICKHOUSE_JWT_CLIENT_ID": "langfuse", "CLICKHOUSE_JWT_CLIENT_SECRET": "s3cret"}), "must use https"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := connectionOptions(environment(tc.env), nil)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error = %v, want one mentioning %q", err, tc.want)
			}
		})
	}
}

func TestParseArguments(t *testing.T) {
	parsed, err := parseArguments([]string{"-source", "/migrations", "-table-engine", "MergeTree", "-cluster", "%27eu-west%5C%27%20%26%20blue%27", "drop", "-f"})
	if err != nil {
		t.Fatal(err)
	}
	want := arguments{source: "/migrations", tableEngine: "MergeTree", cluster: `'eu-west\' & blue'`, command: "drop", force: true}
	if parsed != want {
		t.Errorf("parsed = %+v, want %+v", parsed, want)
	}

	for _, args := range [][]string{
		{"up"},
		{"-source", "/migrations"},
		{"-source", "/migrations", "goto", "3"},
		{"-source", "/migrations", "down", "-f"},
	} {
		if _, err := parseArguments(args); err == nil {
			t.Errorf("parseArguments(%q) returned no error", args)
		}
	}
}
