package wire

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

// TestDecimalJSString pins parity with decimal.js toString() (Prisma.Decimal),
// which uses exponential notation below 1e-7 and above 1e21 and trims
// trailing zeros.
func TestDecimalJSString(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"0", "0"},
		{"123", "123"},
		{"1.5", "1.5"},
		{"2.50000000", "2.5"},
		{"0.000015", "0.000015"},
		{"0.000015000000", "0.000015"},
		{"0.0000001", "1e-7"},
		{"0.00000025", "2.5e-7"},
		{"0.000000025", "2.5e-8"},
		{"-0.5", "-0.5"},
		{"-0.00000003", "-3e-8"},
		{"1000000", "1000000"},
	}
	for _, tc := range cases {
		d, err := decimal.NewFromString(tc.in)
		if err != nil {
			t.Fatalf("bad test input %q: %v", tc.in, err)
		}
		if got := DecimalJSString(d); got != tc.want {
			t.Errorf("DecimalJSString(%s) = %s, want %s", tc.in, got, tc.want)
		}
	}
}

func TestToJSISOString(t *testing.T) {
	ts := time.Date(2024, 6, 1, 12, 0, 0, 123_456_789, time.UTC)
	if got := ToJSISOString(ts); got != "2024-06-01T12:00:00.123Z" {
		t.Errorf("got %s", got)
	}
	// whole seconds keep three fractional digits, like JS toISOString
	ts = time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	if got := ToJSISOString(ts); got != "2024-06-01T12:00:00.000Z" {
		t.Errorf("got %s", got)
	}
}

func TestParseJSONPrioritised(t *testing.T) {
	if v := parseJSONPrioritised(`{"a":1}`); v == nil {
		t.Error("expected parsed object")
	}
	if v := parseJSONPrioritised("plain text"); v != "plain text" {
		t.Errorf("unparsable string should pass through, got %v", v)
	}
	if v := parseJSONPrioritised("123"); v.(interface{ String() string }).String() != "123" {
		t.Errorf("numeric scalar should parse as json.Number, got %v", v)
	}
	// JSON.parse rejects trailing content
	if v := parseJSONPrioritised(`{"a":1} trailing`); v != `{"a":1} trailing` {
		t.Errorf("trailing content should pass through raw, got %v", v)
	}
}

func TestRowToAPIObservationCoreAndTransforms(t *testing.T) {
	start := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(1500 * time.Millisecond)

	row := map[string]any{
		"id": "span-1", "trace_id": "trace-1", "project_id": "p1", "type": "SPAN",
		"start_time": start, "end_time": end,
		"parent_observation_id": "",
	}
	out := RowToAPIObservation(row, nil)

	if out["parentObservationId"] != nil {
		t.Errorf("empty parent_observation_id must map to null, got %v", out["parentObservationId"])
	}
	if out["startTime"] != "2024-06-01T12:00:00.000Z" {
		t.Errorf("startTime = %v", out["startTime"])
	}
	// latency computed from core start/end when metrics group absent
	if out["latency"] != 1.5 {
		t.Errorf("latency = %v, want 1.5", out["latency"])
	}
	// timeToFirstToken null without completion_start_time
	if out["timeToFirstToken"] != nil {
		t.Errorf("timeToFirstToken = %v, want nil", out["timeToFirstToken"])
	}
	// enrichment fields always present (null without model group)
	for _, key := range []string{"modelId", "inputPrice", "outputPrice", "totalPrice"} {
		v, present := out[key]
		if !present || v != nil {
			t.Errorf("%s: expected present and null, got present=%v value=%v", key, present, v)
		}
	}
	// absent groups: keys must be absent
	for _, key := range []string{"name", "usageDetails", "metadata", "input"} {
		if _, present := out[key]; present {
			t.Errorf("%s should be absent without its field group", key)
		}
	}
}

func TestRowToAPIObservationMetricsOverride(t *testing.T) {
	start := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	row := map[string]any{
		"id": "s", "trace_id": "t", "project_id": "p", "type": "SPAN",
		"start_time": start, "end_time": nil, "parent_observation_id": "x",
		"latency": int64(2500), "time_to_first_token": nil,
	}
	out := RowToAPIObservation(row, nil)
	if out["latency"] != 2.5 {
		t.Errorf("latency = %v, want 2.5", out["latency"])
	}
	if out["timeToFirstToken"] != nil {
		t.Errorf("ttft = %v, want nil", out["timeToFirstToken"])
	}

	// 0ms ClickHouse latency is falsy in JS -> null
	row["latency"] = int64(0)
	out = RowToAPIObservation(row, nil)
	if out["latency"] != nil {
		t.Errorf("0ms latency must be null, got %v", out["latency"])
	}
}

func TestRowToAPIObservationUsageReduction(t *testing.T) {
	start := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	row := map[string]any{
		"id": "s", "trace_id": "t", "project_id": "p", "type": "GENERATION",
		"start_time": start, "end_time": nil, "parent_observation_id": "",
		"usage_details": map[string]uint64{"input": 100, "input_cached": 20, "output": 50, "total": 170},
		"cost_details":  map[string]decimal.Decimal{"input": decimal.RequireFromString("0.001"), "total": decimal.RequireFromString("0.003")},
	}
	out := RowToAPIObservation(row, nil)

	if out["inputUsage"] != 120.0 {
		t.Errorf("inputUsage = %v, want 120 (input + input_cached)", out["inputUsage"])
	}
	if out["outputUsage"] != 50.0 {
		t.Errorf("outputUsage = %v", out["outputUsage"])
	}
	if out["totalUsage"] != 170.0 {
		t.Errorf("totalUsage = %v", out["totalUsage"])
	}
	if out["totalCost"] != 0.003 {
		t.Errorf("totalCost = %v", out["totalCost"])
	}
	if out["outputCost"] != nil {
		t.Errorf("outputCost should be null when no output cost keys, got %v", out["outputCost"])
	}
}

func TestRowToAPIObservationPromptVersionTruthiness(t *testing.T) {
	start := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	base := map[string]any{
		"id": "s", "trace_id": "t", "project_id": "p", "type": "SPAN",
		"start_time": start, "end_time": nil, "parent_observation_id": "",
	}

	row := cloneRow(base)
	row["prompt_version"] = uint16(3)
	if out := RowToAPIObservation(row, nil); out["promptVersion"] != 3.0 {
		t.Errorf("promptVersion = %v, want 3", out["promptVersion"])
	}

	row = cloneRow(base)
	row["prompt_version"] = nil
	if out := RowToAPIObservation(row, nil); out["promptVersion"] != nil {
		t.Errorf("nil promptVersion should be null")
	}

	// JS truthiness: 0 -> null
	row = cloneRow(base)
	row["prompt_version"] = uint16(0)
	if out := RowToAPIObservation(row, nil); out["promptVersion"] != nil {
		t.Errorf("0 promptVersion should be null, got %v", out["promptVersion"])
	}
}

func TestRowToAPIObservationIONullability(t *testing.T) {
	start := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	row := map[string]any{
		"id": "s", "trace_id": "t", "project_id": "p", "type": "SPAN",
		"start_time": start, "end_time": nil, "parent_observation_id": "",
		"input": "", "output": `{"result": true}`,
	}
	out := RowToAPIObservation(row, nil)
	if out["input"] != nil {
		t.Errorf("empty input must be null, got %v", out["input"])
	}
	if out["output"] != `{"result": true}` {
		t.Errorf("output must stay a raw string, got %v", out["output"])
	}
}

func cloneRow(row map[string]any) map[string]any {
	out := make(map[string]any, len(row))
	for k, v := range row {
		out[k] = v
	}
	return out
}
