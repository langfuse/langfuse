package query

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

// Cursor mirrors ObservationsCursorV2: the position in the result set using
// the table ordering (start_time, xxHash32(trace_id), span_id).
type Cursor struct {
	LastStartTimeTo time.Time
	LastTraceID     string
	LastID          string
}

type cursorWire struct {
	LastStartTimeTo any    `json:"lastStartTimeTo"`
	LastTraceID     string `json:"lastTraceId"`
	LastID          string `json:"lastId"`
}

// base64Alphabet keeps only characters Node's Buffer.from(x, "base64")
// consumes; Node silently ignores everything else, so we must too.
func stripNonBase64(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') ||
			r == '+' || r == '/' || r == '=' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func decodeBase64Lenient(s string) []byte {
	s = stripNonBase64(s)
	// Node accepts both standard and url-safe alphabets.
	s = strings.ReplaceAll(strings.ReplaceAll(s, "-", "+"), "_", "/")
	s = strings.TrimRight(s, "=")
	// Node truncates trailing bytes that don't form a full quantum.
	if r := len(s) % 4; r == 1 {
		s = s[:len(s)-1]
	}
	decoded, err := base64.RawStdEncoding.DecodeString(s)
	if err != nil {
		return nil
	}
	return decoded
}

// DecodeCursor replicates EncodedObservationsCursorV2: base64 -> JSON ->
// schema. Base64/JSON failures raise InvalidRequestError("Invalid cursor
// format"); schema failures raise zod-style validation issues.
func DecodeCursor(value string) (*Cursor, error) {
	decoded := decodeBase64Lenient(value)
	var wire cursorWire
	if err := json.Unmarshal(decoded, &wire); err != nil {
		return nil, apierror.NewInvalidRequestError("Invalid cursor format")
	}

	// z.coerce.date(): new Date(value) for strings/numbers.
	var ts time.Time
	switch v := wire.LastStartTimeTo.(type) {
	case string:
		parsed, err := parseJSDate(v)
		if err != nil {
			return nil, &apierror.ValidationError{Issues: []apierror.ZodIssue{
				issueInvalidDate("cursor", "lastStartTimeTo"),
			}}
		}
		ts = parsed
	case float64:
		ts = time.UnixMilli(int64(v)).UTC()
	default:
		return nil, &apierror.ValidationError{Issues: []apierror.ZodIssue{
			issueInvalidDate("cursor", "lastStartTimeTo"),
		}}
	}

	if wire.LastID == "" && wire.LastTraceID == "" {
		// Distinguish missing keys from empty strings: zod requires the keys
		// to exist as strings. json.Unmarshal leaves them "" either way, so
		// re-check key presence.
		var probe map[string]json.RawMessage
		_ = json.Unmarshal(decoded, &probe)
		if _, ok := probe["lastTraceId"]; !ok {
			return nil, &apierror.ValidationError{Issues: []apierror.ZodIssue{
				issueInvalidType("string", "undefined", "cursor", "lastTraceId"),
			}}
		}
		if _, ok := probe["lastId"]; !ok {
			return nil, &apierror.ValidationError{Issues: []apierror.ZodIssue{
				issueInvalidType("string", "undefined", "cursor", "lastId"),
			}}
		}
	}

	return &Cursor{
		LastStartTimeTo: ts,
		LastTraceID:     wire.LastTraceID,
		LastID:          wire.LastID,
	}, nil
}

// EncodeCursor replicates encodeCursor: JSON with an ISO-8601 timestamp
// (millisecond precision, Z suffix), base64 encoded.
func EncodeCursor(lastStartTime time.Time, lastTraceID, lastID string) string {
	payload := fmt.Sprintf(
		`{"lastStartTimeTo":%q,"lastTraceId":%s,"lastId":%s}`,
		toJSISOString(lastStartTime),
		mustJSON(lastTraceID),
		mustJSON(lastID),
	)
	return base64.StdEncoding.EncodeToString([]byte(payload))
}

func mustJSON(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// toJSISOString formats like JS Date.prototype.toISOString(): UTC with
// exactly three fractional digits.
func toJSISOString(t time.Time) string {
	return t.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
}
