// Package query parses and validates the GET /api/public/v2/observations
// query parameters with the same semantics as the zod schema
// GetObservationsV2Query (web/src/features/public-api/types/observations.ts).
package query

import (
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

// ObservationFieldGroups mirrors OBSERVATION_FIELD_GROUPS_PUBLIC_API.
var ObservationFieldGroups = []string{
	"core", "basic", "time", "io", "metadata", "model", "usage", "prompt", "metrics", "trace_context",
}

var observationTypeValues = []string{
	"GENERATION", "SPAN", "EVENT", "AGENT", "TOOL", "CHAIN", "RETRIEVER", "EVALUATOR", "EMBEDDING", "GUARDRAIL",
}

var observationLevelValues = []string{"DEBUG", "DEFAULT", "WARNING", "ERROR"}

func inList(values []string, v string) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}

// isoDateTimeRe is the Go translation of zod v4's datetime pattern with
// offset: true (see zodDatetimePattern): calendar-aware dates, uppercase Z or
// ±hh:mm offsets, optional seconds and fraction.
var isoDateTimeRe = regexp.MustCompile(
	`^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$`,
)

type Params struct {
	// Fields is nil when the parameter was absent/empty (=> core fields only).
	Fields []string
	// ExpandMetadata is nil when absent or when it contained no non-empty keys.
	ExpandMetadata []string
	Limit          float64
	Cursor         *Cursor

	Type                *string
	Name                *string
	UserID              *string
	Level               *string
	TraceID             *string
	Version             *string
	ParentObservationID *string
	Environment         []string // nil when absent

	FromStartTime *time.Time
	ToStartTime   *time.Time

	Filters []AdvancedFilter
}

func splitCommaSeparated(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

type issueCollector struct {
	issues []apierror.ZodIssue
}

func (c *issueCollector) collect(issue apierror.ZodIssue) {
	c.issues = append(c.issues, issue)
}

// scalar returns the single value of a query parameter, adding a validation
// issue when the parameter was repeated (Next.js turns repeats into arrays,
// which fail z.string()).
func scalar(values url.Values, key string, c *issueCollector) (string, bool) {
	vs, ok := values[key]
	if !ok || len(vs) == 0 {
		return "", false
	}
	if len(vs) > 1 {
		c.collect(issueInvalidType("string", "array", key))
		return "", false
	}
	return vs[0], true
}

// ParseQueryString parses a raw query string with Node querystring
// semantics: pairs split on & and the first =, '+' means space, and invalid
// percent-escapes are kept literally instead of failing the whole parse
// (net/url.ParseQuery would drop such pairs, diverging from Node).
func ParseQueryString(rawQuery string) url.Values {
	values := url.Values{}
	for _, pair := range strings.Split(rawQuery, "&") {
		if pair == "" {
			continue
		}
		key, value, _ := strings.Cut(pair, "=")
		values.Add(lenientUnescape(key), lenientUnescape(value))
	}
	return values
}

// lenientUnescape decodes %XX sequences and '+', leaving malformed escapes
// as literal characters (Node querystring unescapeBuffer behavior).
func lenientUnescape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '+':
			b.WriteByte(' ')
		case s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]):
			v, _ := strconv.ParseUint(s[i+1:i+3], 16, 8)
			b.WriteByte(byte(v))
			i += 2
		default:
			b.WriteByte(s[i])
		}
	}
	return b.String()
}

func isHex(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// Parse validates raw query values in the zod schema's field order. It
// returns either Params or an error rendering through the shared error
// contract (*apierror.ValidationError for zod parity, *apierror.APIError for
// InvalidRequestError parity).
func Parse(values url.Values) (*Params, error) {
	c := &issueCollector{}
	p := &Params{Limit: 50}

	// fields: comma-separated enum array, unknown values silently filtered,
	// absent/empty => null.
	if v, ok := scalar(values, "fields", c); ok && v != "" {
		filtered := []string{}
		for _, item := range splitCommaSeparated(v) {
			if inList(ObservationFieldGroups, item) {
				filtered = append(filtered, item)
			}
		}
		p.Fields = filtered
	}

	// expandMetadata: optional comma-separated strings; empty => nil.
	if v, ok := scalar(values, "expandMetadata", c); ok {
		if items := splitCommaSeparated(v); len(items) > 0 {
			p.ExpandMetadata = items
		}
	}

	// limit: z.coerce.number().nonnegative().lte(1000).default(50)
	if v, ok := scalar(values, "limit", c); ok {
		if v == "" {
			p.Limit = 0 // JS Number("") === 0
		} else {
			n, err := strconv.ParseFloat(v, 64)
			switch {
			case err != nil || math.IsNaN(n):
				c.collect(issueNaN("limit"))
			case n < 0:
				c.collect(issueTooSmall(0, "limit"))
			case n > 1000:
				c.collect(issueTooBig(1000, "limit"))
			default:
				p.Limit = n
			}
		}
	}

	// cursor (schema order: before parseIoAsJson)
	if v, ok := scalar(values, "cursor", c); ok {
		cursor, err := DecodeCursor(v)
		switch e := err.(type) {
		case nil:
			p.Cursor = cursor
		case *apierror.APIError:
			// InvalidRequestError thrown inside the zod transform aborts the
			// whole parse.
			return nil, e
		case *apierror.ValidationError:
			c.issues = append(c.issues, e.Issues...)
		default:
			c.collect(issueCustom(err.Error(), "cursor"))
		}
	}

	// parseIoAsJson: "true" is retired (400); "false" is a no-op; anything
	// else fails the union of literals.
	if v, ok := scalar(values, "parseIoAsJson", c); ok {
		switch v {
		case "false":
		case "true":
			c.collect(issueCustom("parseIoAsJson=true is no longer supported on the v2 observations endpoint. Input/output fields are always returned as raw strings. Remove the parseIoAsJson parameter or set it to false.", "parseIoAsJson"))
		default:
			c.collect(issueUnionOfLiterals([][]string{{"true"}, {"false"}}, "parseIoAsJson"))
		}
	}

	// Simple filters, in schema field order: type, name, userId, level,
	// traceId, version, parentObservationId.
	if v, ok := scalar(values, "type", c); ok {
		if !inList(observationTypeValues, v) {
			c.collect(issueEnum(observationTypeValues, "type"))
		} else {
			p.Type = &v
		}
	}
	if v, ok := scalar(values, "name", c); ok {
		p.Name = &v
	}
	if v, ok := scalar(values, "userId", c); ok {
		p.UserID = &v
	}
	if v, ok := scalar(values, "level", c); ok {
		if !inList(observationLevelValues, v) {
			c.collect(issueEnum(observationLevelValues, "level"))
		} else {
			p.Level = &v
		}
	}
	if v, ok := scalar(values, "traceId", c); ok {
		p.TraceID = &v
	}
	if v, ok := scalar(values, "version", c); ok {
		p.Version = &v
	}
	if v, ok := scalar(values, "parentObservationId", c); ok {
		p.ParentObservationID = &v
	}

	// environment: string or repeated params (array)
	if vs, ok := values["environment"]; ok && len(vs) > 0 {
		p.Environment = vs
	}

	// fromStartTime / toStartTime: ISO datetime with offset allowed
	for _, spec := range []struct {
		key  string
		dest **time.Time
	}{
		{"fromStartTime", &p.FromStartTime},
		{"toStartTime", &p.ToStartTime},
	} {
		if v, ok := scalar(values, spec.key, c); ok {
			if !isoDateTimeRe.MatchString(v) {
				c.collect(issueInvalidDatetimeFormat(spec.key))
				continue
			}
			t, err := parseJSDate(v)
			if err != nil {
				c.collect(issueInvalidDatetimeFormat(spec.key))
				continue
			}
			*spec.dest = &t
		}
	}

	// filter: JSON array of advanced filters (last schema field)
	if v, ok := scalar(values, "filter", c); ok && v != "" {
		filters, err := ParseAdvancedFilters(v)
		switch e := err.(type) {
		case nil:
			p.Filters = filters
		case *apierror.APIError:
			return nil, e
		case *apierror.ValidationError:
			c.issues = append(c.issues, e.Issues...)
		default:
			c.collect(issueCustom(err.Error(), "filter"))
		}
	}

	if len(c.issues) > 0 {
		return nil, &apierror.ValidationError{Issues: c.issues}
	}
	return p, nil
}

// parseJSDate parses date strings the way JS `new Date(...)` does for the
// formats that reach this service (ISO 8601 with zone, date-only = UTC).
// JS Date keeps millisecond precision; extra fractional digits are truncated.
func parseJSDate(s string) (time.Time, error) {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04Z07:00",
		"2006-01-02T15:04:05.999999999Z0700",
		"2006-01-02T15:04Z0700",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Truncate(time.Millisecond), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid date: %s", s)
}
