package chquery

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
	"github.com/langfuse/langfuse/go/observations-api/internal/query"
)

func buildFromQS(t *testing.T, qs string) (*Query, error) {
	t.Helper()
	values, err := url.ParseQuery(qs)
	if err != nil {
		t.Fatalf("bad query string: %v", err)
	}
	params, err := query.Parse(values)
	if err != nil {
		t.Fatalf("param parse failed: %v", err)
	}
	return Build(params, "proj-1")
}

func mustBuild(t *testing.T, qs string) *Query {
	t.Helper()
	q, err := buildFromQS(t, qs)
	if err != nil {
		t.Fatalf("build failed: %v", err)
	}
	return q
}

func paramValue(q *Query, name string) (string, bool) {
	for _, p := range q.Params {
		if p.Name == name {
			return p.Value, true
		}
	}
	return "", false
}

func TestBuildDefaultCoreOnly(t *testing.T) {
	q := mustBuild(t, "")

	if !strings.Contains(q.SQL, "FROM events_core e") {
		t.Errorf("default query must read events_core:\n%s", q.SQL)
	}
	if strings.Contains(q.SQL, "WITH base AS") {
		t.Errorf("default query must not use the CTE split:\n%s", q.SQL)
	}
	// core columns only
	for _, expr := range []string{"e.span_id as id", `e.trace_id as "trace_id"`, `e.parent_span_id as "parent_observation_id"`} {
		if !strings.Contains(q.SQL, expr) {
			t.Errorf("missing core expression %q:\n%s", expr, q.SQL)
		}
	}
	if strings.Contains(q.SQL, "e.name as name") {
		t.Errorf("basic group must not be selected by default:\n%s", q.SQL)
	}
	// PK-prefixed ordering
	if !strings.Contains(q.SQL, "ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC, xxHash32(e.trace_id) DESC, e.span_id DESC") {
		t.Errorf("wrong ORDER BY:\n%s", q.SQL)
	}
	// limit+1
	if v, _ := paramValue(q, "rowLimit"); v != "51" {
		t.Errorf("limit param = %s, want 51 (limit+1)", v)
	}
	if v, _ := paramValue(q, "projectId"); v != "proj-1" {
		t.Errorf("projectId param = %s", v)
	}
}

func TestBuildSimpleFilters(t *testing.T) {
	q := mustBuild(t, "userId=u1&type=SPAN&fromStartTime=2024-06-01T00%3A00%3A00Z&toStartTime=2024-06-02T00%3A00%3A00Z&environment=prod%2Cstaging")

	for _, fragment := range []string{
		"e.user_id = {stringFilter",
		"e.type = {stringFilter",
		"e.start_time >= {dateTimeFilter",
		"e.start_time < {dateTimeFilter",
		"e.environment IN ({stringOptionsFilter",
	} {
		if !strings.Contains(q.SQL, fragment) {
			t.Errorf("missing fragment %q:\n%s", fragment, q.SQL)
		}
	}
	if v, _ := paramValue(q, "dateTimeFilter1"); v != "2024-06-01 00:00:00.000" {
		t.Errorf("fromStartTime param = %q", v)
	}
	if v, _ := paramValue(q, "stringOptionsFilter1"); v != "['prod','staging']" {
		t.Errorf("environment param = %q", v)
	}
}

func TestBuildCursorPredicate(t *testing.T) {
	cursor := query.EncodeCursor(mustTime(t, "2024-06-01T12:00:00.123Z"), "trace-9", "span-9")
	q := mustBuild(t, "cursor="+url.QueryEscape(cursor))

	if !strings.Contains(q.SQL, "e.start_time <= {lastStartTime: DateTime64(6)} AND (e.start_time, xxHash32(e.trace_id), e.span_id) < ({lastStartTime: DateTime64(6)}, xxHash32({lastTraceId: String}), {lastId: String})") {
		t.Errorf("missing cursor predicate:\n%s", q.SQL)
	}
	if v, _ := paramValue(q, "lastStartTime"); v != "2024-06-01 12:00:00.123" {
		t.Errorf("lastStartTime = %q", v)
	}
	if v, _ := paramValue(q, "lastTraceId"); v != "trace-9" {
		t.Errorf("lastTraceId = %q", v)
	}
}

func TestBuildIOUsesSplitQuery(t *testing.T) {
	q := mustBuild(t, "fields=io,basic")

	for _, fragment := range []string{
		"WITH base AS (",
		"io AS (SELECT e.span_id as _io_id",
		"FROM events_full e",
		`AND (e.start_time, e.trace_id, e.span_id) IN (SELECT "start_time", "trace_id", id FROM base)`,
		`LEFT ANY JOIN io i ON b."start_time" = i."_io_start_time" AND b."trace_id" = i."_io_trace_id" AND b.id = i._io_id`,
		"i.input as input",
		"ORDER BY b.start_time DESC, xxHash32(b.trace_id) DESC, b.id DESC",
	} {
		if !strings.Contains(q.SQL, fragment) {
			t.Errorf("missing fragment %q:\n%s", fragment, q.SQL)
		}
	}
	// base must NOT select io columns
	if strings.Contains(q.SQL, "e.input,\n") {
		t.Errorf("base CTE must not select input:\n%s", q.SQL)
	}
	// aliases include io at the end
	if q.Aliases[len(q.Aliases)-2] != "input" || q.Aliases[len(q.Aliases)-1] != "output" {
		t.Errorf("aliases = %v", q.Aliases)
	}
}

func TestBuildMetadataPlacement(t *testing.T) {
	// metadata without io/expand: from events_core, simple path
	q := mustBuild(t, "fields=metadata")
	if strings.Contains(q.SQL, "WITH base AS") {
		t.Errorf("metadata-only must not split:\n%s", q.SQL)
	}
	if !strings.Contains(q.SQL, "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata") {
		t.Errorf("missing metadata expression:\n%s", q.SQL)
	}

	// metadata + expandMetadata: io CTE fetches full metadata from events_full
	q = mustBuild(t, "fields=metadata&expandMetadata=transcript")
	if !strings.Contains(q.SQL, "WITH base AS") {
		t.Errorf("expandMetadata must trigger split:\n%s", q.SQL)
	}
	if !strings.Contains(q.SQL, "i.metadata as metadata") {
		t.Errorf("metadata must come from io CTE:\n%s", q.SQL)
	}

	// expandMetadata without metadata group: no split
	q = mustBuild(t, "fields=basic&expandMetadata=transcript")
	if strings.Contains(q.SQL, "WITH base AS") {
		t.Errorf("expandMetadata without metadata group must not split:\n%s", q.SQL)
	}
}

func TestBuildAdvancedFilterPrecedenceAndMerge(t *testing.T) {
	// Node quirk parity: advanced-filter "precedence" compares field
	// expressions that never match the simple-mapping fields for events
	// tables, so both filters apply (ANDed).
	filter := `[{"type":"string","column":"name","operator":"contains","value":"llm"}]`
	q := mustBuild(t, "name=exact-name&filter="+url.QueryEscape(filter))

	if !strings.Contains(q.SQL, `position(e."name", {stringFilter`) {
		t.Errorf("advanced contains filter missing:\n%s", q.SQL)
	}
	if !strings.Contains(q.SQL, "e.name = {stringFilter") {
		t.Errorf("simple name filter must also apply:\n%s", q.SQL)
	}
}

func TestBuildAdvancedFilterOperators(t *testing.T) {
	cases := []struct {
		name     string
		filter   string
		fragment string
	}{
		{"string starts with", `[{"type":"string","column":"name","operator":"starts with","value":"a"}]`, `startsWith(e."name", {stringFilter`},
		{"number gte", `[{"type":"number","column":"promptVersion","operator":">=","value":2}]`, "e.prompt_version >= {numberFilter1: Decimal64(12)}"},
		{"number latency overwrite", `[{"type":"number","column":"latency","operator":">","value":1.5}]`, "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time) / 1000) > {numberFilter1: Decimal64(3)}"},
		{"datetime", `[{"type":"datetime","column":"startTime","operator":">=","value":"2024-06-01T00:00:00Z"}]`, `e."start_time" >= {dateTimeFilter1: DateTime64(3)}`},
		{"stringOptions", `[{"type":"stringOptions","column":"type","operator":"any of","value":["SPAN","EVENT"]}]`, `e."type" IN ({stringOptionsFilter1: Array(String)})`},
		{"arrayOptions all of", `[{"type":"arrayOptions","column":"tags","operator":"all of","value":["a"]}]`, `hasAll(e."tags", {arrayOptionsFilter1: Array(String)}) = True`},
		{"null with emptyEqualsNull", `[{"type":"null","column":"parentObservationId","operator":"is null","value":""}]`, `(e."parent_span_id" = '' OR e."parent_span_id" IS NULL)`},
		{"boolean", `[{"type":"boolean","column":"hasParentObservation","operator":"=","value":true}]`, "e.parent_span_id != '' = {booleanFilter1: Boolean}"},
		{"stringObject metadata equals", `[{"type":"stringObject","column":"metadata","operator":"=","key":"env","value":"prod"}]`, "has(e.metadata_names, {stringObjectKeyFilter1: String}) AND has(e.metadata_values, {stringObjectValueFilter1: String}) AND (e.metadata_values[indexOf(e.metadata_names, {stringObjectKeyFilter1: String})] = {stringObjectValueFilter1: String})"},
	}

	for _, tc := range cases {
		q, err := buildFromQS(t, "filter="+url.QueryEscape(tc.filter))
		if err != nil {
			t.Errorf("%s: build failed: %v", tc.name, err)
			continue
		}
		if !strings.Contains(q.SQL, tc.fragment) {
			t.Errorf("%s: missing fragment %q:\n%s", tc.name, tc.fragment, q.SQL)
		}
	}
}

func TestBuildMetadataFilterForcesFullTable(t *testing.T) {
	filter := `[{"type":"stringObject","column":"metadata","operator":"=","key":"env","value":"prod"}]`
	q := mustBuild(t, "filter="+url.QueryEscape(filter))
	if !strings.Contains(q.SQL, "FROM events_full e") {
		t.Errorf("metadata filter must force events_full:\n%s", q.SQL)
	}
}

func TestBuildIOFilterValidation(t *testing.T) {
	// non-string filter type on input -> 400
	_, err := buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"null","column":"input","operator":"is null","value":""}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || apiErr.Message != "Input/output filters only support filter type `string`." {
		t.Errorf("expected IO filter type error, got %v", err)
	}

	// unindexed-only IO filter -> 400
	_, err = buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"input","operator":"contains","value":"x"}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || apiErr.Message != "Input/output filters require at least one `matches` or `=` operator." {
		t.Errorf("expected indexed IO filter error, got %v", err)
	}

	// contains + matches passes and reads events_full
	q := mustBuild(t, "filter="+url.QueryEscape(`[{"type":"string","column":"input","operator":"contains","value":"x"},{"type":"string","column":"output","operator":"matches","value":"hello world"}]`))
	if !strings.Contains(q.SQL, "FROM events_full e") {
		t.Errorf("IO filters must force events_full:\n%s", q.SQL)
	}
	if !strings.Contains(q.SQL, "hasAllTokens(lower(e.output)") {
		t.Errorf("matches must lower to hasAllTokens:\n%s", q.SQL)
	}
}

func TestBuildMatchesValidation(t *testing.T) {
	// matches on non-IO/metadata column -> 400 target error
	_, err := buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"name","operator":"matches","value":"hello"}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || apiErr.Message != "`matches` is only supported for input, output, and metadata filters." {
		t.Errorf("expected matches target error, got %v", err)
	}

	// tokenless value -> 400 token error
	_, err = buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"input","operator":"matches","value":"!!!"}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || apiErr.Message != "`matches` requires at least one search token." {
		t.Errorf("expected matches token error, got %v", err)
	}
}

func TestBuildUnknownFilterColumn(t *testing.T) {
	_, err := buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"doesNotExist","operator":"=","value":"x"}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || !strings.Contains(apiErr.Message, "does not match a UI / CH table mapping") {
		t.Errorf("expected column mapping error, got %v", err)
	}
}

func TestBuildFilterTypeCompatibility(t *testing.T) {
	// metadata column requires stringObject filters; a plain string filter is
	// rejected via COMPATIBLE_FILTER_TYPES.
	_, err := buildFromQS(t, "filter="+url.QueryEscape(`[{"type":"string","column":"metadata","operator":"=","value":"x"}]`))
	if apiErr, ok := err.(*apierror.APIError); !ok || !strings.Contains(apiErr.Message, "Invalid filter type 'string' for column 'metadata'") {
		t.Errorf("expected compat error, got %v", err)
	}
}

func mustTime(t *testing.T, iso string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		t.Fatalf("bad time %s: %v", iso, err)
	}
	return parsed
}
