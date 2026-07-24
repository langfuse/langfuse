package auth

import (
	"encoding/base64"
	"testing"
)

// TestFastHash pins the exact createShaHash formula:
// sha256_hex( secretKey ++ hex(sha256(salt)) ).
// Expected values generated with the Node implementation:
//
//	crypto.createHash("sha256").update(sk).update(
//	  crypto.createHash("sha256").update(salt, "utf8").digest("hex")
//	).digest("hex")
func TestFastHash(t *testing.T) {
	cases := []struct {
		secretKey string
		salt      string
		expected  string
	}{
		// node -e 'const c=require("crypto");const salt="salt";const sk="sk-lf-1234567890";console.log(c.createHash("sha256").update(sk).update(c.createHash("sha256").update(salt,"utf8").digest("hex")).digest("hex"))'
		{"sk-lf-1234567890", "salt", "ed6818ada09bdad405a74ac72773dde1708dd3fc6fe8bb81b59927400419d227"},
		{"sk-lf-1234567890", "othersalt", "9ab383713696286f5f28e632ec19cffd51d324096633358157b0328bbbf2f142"},
		{"", "salt", "9641ca7fe349aaf28fdca8179a8851f2dc2a467a3c75edff08005f0953d1d1d5"},
	}

	for _, tc := range cases {
		got := FastHash(tc.secretKey, tc.salt)
		if got != tc.expected {
			t.Errorf("FastHash(%q, %q) = %s, want %s", tc.secretKey, tc.salt, got, tc.expected)
		}
	}
}

func TestParseBasicAuth(t *testing.T) {
	encode := func(s string) string { return "Basic " + base64.StdEncoding.EncodeToString([]byte(s)) }

	pk, sk, failure := parseBasicAuth(encode("pk-lf-abc:sk-lf-def"))
	if failure != nil || pk != "pk-lf-abc" || sk != "sk-lf-def" {
		t.Errorf("expected valid parse, got %q %q %v", pk, sk, failure)
	}

	// Secret keys may contain colons: atob(x).split(":") takes [0] and [1].
	pk, sk, failure = parseBasicAuth(encode("pk:sk:extra"))
	if failure != nil || pk != "pk" || sk != "sk" {
		t.Errorf("colon handling: got %q %q %v", pk, sk, failure)
	}

	for _, invalid := range []string{"Basic ", encode("nocolon"), encode(":sk"), encode("pk:")} {
		if _, _, failure := parseBasicAuth(invalid); failure == nil || failure.Message != "Invalid authorization header. Confirm that you've configured the correct host." {
			t.Errorf("expected invalid-header failure for %q, got %v", invalid, failure)
		}
	}

	// Non-base64 characters reproduce Node's atob InvalidCharacterError.
	if _, _, failure := parseBasicAuth("Basic !!!notbase64"); failure == nil || failure.Message != "Invalid character. Confirm that you've configured the correct host." {
		t.Errorf("expected atob invalid-character failure, got %v", failure)
	}
}

func TestCacheKeyForHash(t *testing.T) {
	if got := CacheKeyForHash("tenant1:", "abc"); got != "tenant1:api-key:abc" {
		t.Errorf("unexpected cache key: %s", got)
	}
	if got := CacheKeyForHash("", "abc"); got != "api-key:abc" {
		t.Errorf("unexpected cache key: %s", got)
	}
}
