package query

import (
	"net/url"
	"testing"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

func parseQS(t *testing.T, qs string) (*Params, error) {
	t.Helper()
	values, err := url.ParseQuery(qs)
	if err != nil {
		t.Fatalf("bad query string: %v", err)
	}
	return Parse(values)
}

func TestParseDefaults(t *testing.T) {
	p, err := parseQS(t, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Limit != 50 {
		t.Errorf("default limit = %v, want 50", p.Limit)
	}
	if p.Fields != nil {
		t.Errorf("fields should be nil when absent")
	}
}

func TestParseLimitEdgeCases(t *testing.T) {
	// zod: z.coerce.number().nonnegative().lte(1000).default(50)
	for qs, want := range map[string]float64{
		"limit=100": 100,
		"limit=0":   0,
		"limit=":    0, // JS Number("") === 0
	} {
		p, err := parseQS(t, qs)
		if err != nil {
			t.Errorf("%s: unexpected error %v", qs, err)
			continue
		}
		if p.Limit != want {
			t.Errorf("%s: limit = %v, want %v", qs, p.Limit, want)
		}
	}

	for _, qs := range []string{"limit=1001", "limit=-1", "limit=abc"} {
		_, err := parseQS(t, qs)
		if _, ok := err.(*apierror.ValidationError); !ok {
			t.Errorf("%s: expected ValidationError, got %v", qs, err)
		}
	}
}

func TestParseFieldsFiltering(t *testing.T) {
	p, err := parseQS(t, "fields=basic,bogus,io")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.Fields) != 2 || p.Fields[0] != "basic" || p.Fields[1] != "io" {
		t.Errorf("fields = %v, want [basic io]", p.Fields)
	}

	// all-unknown values -> empty array (not nil)
	p, err = parseQS(t, "fields=bogus")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Fields == nil || len(p.Fields) != 0 {
		t.Errorf("fields = %v, want []", p.Fields)
	}

	// empty string -> nil (zod preprocess maps "" to undefined -> default null)
	p, err = parseQS(t, "fields=")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Fields != nil {
		t.Errorf("fields = %v, want nil", p.Fields)
	}
}

func TestParseIoAsJson(t *testing.T) {
	if _, err := parseQS(t, "parseIoAsJson=false"); err != nil {
		t.Errorf("parseIoAsJson=false must be accepted: %v", err)
	}
	for _, qs := range []string{"parseIoAsJson=true", "parseIoAsJson=1"} {
		_, err := parseQS(t, qs)
		if _, ok := err.(*apierror.ValidationError); !ok {
			t.Errorf("%s: expected ValidationError, got %v", qs, err)
		}
	}
}

func TestParseEnums(t *testing.T) {
	p, err := parseQS(t, "type=GENERATION&level=ERROR")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *p.Type != "GENERATION" || *p.Level != "ERROR" {
		t.Errorf("type/level = %v %v", *p.Type, *p.Level)
	}

	for _, qs := range []string{"type=BOGUS", "level=bogus"} {
		_, err := parseQS(t, qs)
		if _, ok := err.(*apierror.ValidationError); !ok {
			t.Errorf("%s: expected ValidationError, got %v", qs, err)
		}
	}
}

func TestParseEnvironmentMulti(t *testing.T) {
	p, err := parseQS(t, "environment=production&environment=staging")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.Environment) != 2 {
		t.Errorf("environment = %v", p.Environment)
	}

	p, err = parseQS(t, "environment=production")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.Environment) != 1 || p.Environment[0] != "production" {
		t.Errorf("environment = %v", p.Environment)
	}
}

func TestParseStartTimeValidation(t *testing.T) {
	valid := []string{
		"2024-06-01T12:00:00Z",
		"2024-06-01T12:00:00.123Z",
		"2024-06-01T12:00:00+02:00",
		"2024-06-01T12:00Z",
	}
	for _, v := range valid {
		if _, err := parseQS(t, "fromStartTime="+url.QueryEscape(v)); err != nil {
			t.Errorf("%s should be valid: %v", v, err)
		}
	}

	invalid := []string{"2024-06-01", "not-a-date", "2024-06-01 12:00:00", "2024-06-01T12:00:00"}
	for _, v := range invalid {
		_, err := parseQS(t, "fromStartTime="+url.QueryEscape(v))
		if _, ok := err.(*apierror.ValidationError); !ok {
			t.Errorf("%s: expected ValidationError, got %v", v, err)
		}
	}
}

func TestParseFilterJSON(t *testing.T) {
	p, err := parseQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"name","operator":"=","value":"test"}]`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.Filters) != 1 || p.Filters[0].StringValue != "test" {
		t.Errorf("filters = %+v", p.Filters)
	}

	// invalid JSON -> InvalidRequestError (400 with error name, not zod issues)
	_, err = parseQS(t, "filter="+url.QueryEscape(`[{bad json`))
	apiErr, ok := err.(*apierror.APIError)
	if !ok || apiErr.Message != "Invalid JSON in filter parameter" {
		t.Errorf("expected InvalidRequestError for bad JSON, got %v", err)
	}

	// valid JSON, wrong shape -> validation error
	_, err = parseQS(t, "filter="+url.QueryEscape(`{"not":"array"}`))
	if _, ok := err.(*apierror.ValidationError); !ok {
		t.Errorf("expected ValidationError for non-array, got %v", err)
	}

	// unknown column passes zod (column is z.string()); rejected later by the
	// query builder. Unknown type is a zod failure.
	_, err = parseQS(t, "filter="+url.QueryEscape(`[{"type":"bogus","column":"name","operator":"=","value":"x"}]`))
	if _, ok := err.(*apierror.ValidationError); !ok {
		t.Errorf("expected ValidationError for unknown filter type, got %v", err)
	}
}

func TestParseRepeatedScalarParamRejected(t *testing.T) {
	_, err := parseQS(t, "name=a&name=b")
	if _, ok := err.(*apierror.ValidationError); !ok {
		t.Errorf("expected ValidationError for repeated scalar param, got %v", err)
	}
}
