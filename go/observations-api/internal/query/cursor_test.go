package query

import (
	"encoding/base64"
	"testing"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

func TestEncodeCursorMatchesNodeFormat(t *testing.T) {
	// Node: Buffer.from(JSON.stringify({lastStartTimeTo: date.toISOString(),
	// lastTraceId, lastId})).toString("base64")
	ts := time.Date(2024, 6, 1, 12, 0, 0, 123_000_000, time.UTC)
	got := EncodeCursor(ts, "trace-1", "span-1")

	decoded, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("cursor is not valid base64: %v", err)
	}
	want := `{"lastStartTimeTo":"2024-06-01T12:00:00.123Z","lastTraceId":"trace-1","lastId":"span-1"}`
	if string(decoded) != want {
		t.Errorf("cursor JSON = %s, want %s", decoded, want)
	}
}

func TestCursorRoundTrip(t *testing.T) {
	ts := time.Date(2024, 6, 1, 12, 0, 0, 123_000_000, time.UTC)
	encoded := EncodeCursor(ts, "trace-1", "span-1")

	cursor, err := DecodeCursor(encoded)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if !cursor.LastStartTimeTo.Equal(ts) {
		t.Errorf("timestamp = %v, want %v", cursor.LastStartTimeTo, ts)
	}
	if cursor.LastTraceID != "trace-1" || cursor.LastID != "span-1" {
		t.Errorf("ids = %q %q", cursor.LastTraceID, cursor.LastID)
	}
}

func TestDecodeCursorInvalidFormat(t *testing.T) {
	// Node Buffer.from(x, "base64") is lenient; failures surface as JSON
	// parse errors -> InvalidRequestError("Invalid cursor format").
	for _, invalid := range []string{
		"not-base64-json",
		base64.StdEncoding.EncodeToString([]byte("not json")),
		base64.StdEncoding.EncodeToString([]byte("[1,2,3]")),
		"",
	} {
		_, err := DecodeCursor(invalid)
		apiErr, ok := err.(*apierror.APIError)
		if !ok || apiErr.Message != "Invalid cursor format" {
			t.Errorf("DecodeCursor(%q): expected InvalidRequestError(Invalid cursor format), got %v", invalid, err)
		}
	}
}

func TestDecodeCursorSchemaFailure(t *testing.T) {
	// Valid base64 JSON object but missing/incorrect fields -> zod-style
	// validation error (not InvalidRequestError).
	encoded := base64.StdEncoding.EncodeToString([]byte(`{"lastStartTimeTo":"garbage-date","lastTraceId":"t","lastId":"i"}`))
	_, err := DecodeCursor(encoded)
	if _, ok := err.(*apierror.ValidationError); !ok {
		t.Errorf("expected ValidationError for bad date, got %v", err)
	}

	encoded = base64.StdEncoding.EncodeToString([]byte(`{"lastStartTimeTo":"2024-06-01T12:00:00.000Z"}`))
	_, err = DecodeCursor(encoded)
	if _, ok := err.(*apierror.ValidationError); !ok {
		t.Errorf("expected ValidationError for missing keys, got %v", err)
	}
}

func TestDecodeCursorNumericTimestamp(t *testing.T) {
	// z.coerce.date() accepts epoch millis.
	encoded := base64.StdEncoding.EncodeToString([]byte(`{"lastStartTimeTo":1717243200123,"lastTraceId":"t","lastId":"i"}`))
	cursor, err := DecodeCursor(encoded)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	want := time.UnixMilli(1717243200123).UTC()
	if !cursor.LastStartTimeTo.Equal(want) {
		t.Errorf("timestamp = %v, want %v", cursor.LastStartTimeTo, want)
	}
}
