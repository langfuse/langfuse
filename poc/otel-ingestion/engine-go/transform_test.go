// Ports of the engine-rust test suites (transform.rs + otel.rs), asserting
// the same fixtures produce the same degraded values — the unit-level half
// of checksum parity.
package main

import (
	"reflect"
	"strings"
	"testing"

	json "github.com/go-json-experiment/json"
)

func transformCollect(t *testing.T, projectID, blobPath string, data []byte) []*eventRow {
	t.Helper()
	var rows []*eventRow
	if err := transformBatch(projectID, blobPath, data, func(r *eventRow) { rows = append(rows, r) }); err != nil {
		t.Fatalf("transformBatch: %v", err)
	}
	return rows
}

func TestMediaExtractionOffsetsAndID(t *testing.T) {
	// sha256("hello") in urlsafe base64
	input := `[{"role":"user","content":"see data:image/png;base64,aGVsbG8= end"}]`
	uriStart := strings.Index(input, "data:")
	rewritten, manifest := extractMedia(input)

	if len(manifest) != 1 {
		t.Fatalf("manifest entries: %d", len(manifest))
	}
	m := manifest[0]
	if m.mediaID != "LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=" {
		t.Errorf("media id: %s", m.mediaID)
	}
	if m.contentType != "image/png" || m.field != "input" {
		t.Errorf("content type/field: %s %s", m.contentType, m.field)
	}
	uri := "data:image/png;base64,aGVsbG8="
	if m.byteOffset != uint32(uriStart) || m.byteLength != uint32(len(uri)) {
		t.Errorf("offsets: %d %d", m.byteOffset, m.byteLength)
	}
	token := "@@@langfuseMedia:type=image/png|id=" + m.mediaID + "|source=base64_data_uri@@@"
	if !strings.Contains(rewritten, token) || strings.Contains(rewritten, "data:image/png") {
		t.Errorf("rewritten: %s", rewritten)
	}
	// slicing the ORIGINAL at manifest offsets must hit the data URI
	if got := input[m.byteOffset : m.byteOffset+m.byteLength]; got != uri {
		t.Errorf("original slice: %s", got)
	}
}

func TestMediaNoopReturnsInputUnchanged(t *testing.T) {
	input := "plain text, no media"
	out, manifest := extractMedia(input)
	if out != input || len(manifest) != 0 {
		t.Errorf("out=%q manifest=%v", out, manifest)
	}
}

func TestMetadataValueLanesMatchSQLPrecedence(t *testing.T) {
	file := []byte(`[{
	  "resource": {"attributes": []},
	  "scopeSpans": [{"scope": {"name": "s", "version": "1"}, "spans": [{
	    "traceId": "aa", "spanId": "bb",
	    "startTimeUnixNano": "1700000000000000001",
	    "endTimeUnixNano": "1700000000000000999",
	    "name": "n",
	    "attributes": [
	      {"key": "langfuse.observation.metadata.region", "value": {"stringValue": "eu"}},
	      {"key": "langfuse.observation.metadata.attempt", "value": {"intValue": "2"}},
	      {"key": "gen_ai.request.temperature", "value": {"doubleValue": 0.7}},
	      {"key": "gen_ai.request.top_p", "value": {"doubleValue": 1}},
	      {"key": "langfuse.user.id", "value": {"stringValue": "u1"}}
	    ]
	  }]}]
	}]`)
	rows := transformCollect(t, "p", "b/k.json", file)
	if len(rows) != 1 {
		t.Fatalf("rows: %d", len(rows))
	}
	row := rows[0]
	wantNames := []string{"region", "attempt", "gen_ai.request.temperature", "gen_ai.request.top_p"}
	if !reflect.DeepEqual(row.metadataNames, wantNames) {
		t.Errorf("metadata names: %v", row.metadataNames)
	}
	// top_p=1 arrives as an integer token but the shared doubleValue path
	// holds floats too, so both engines print "1" for it
	wantValues := []string{"eu", "2", "0.7", "1"}
	if !reflect.DeepEqual(row.metadataValues, wantValues) {
		t.Errorf("metadata values: %v", row.metadataValues)
	}
	if row.userID != "u1" {
		t.Errorf("user id: %s", row.userID)
	}
	// ns -> micros truncation
	if row.startTimeUs != 1700000000000000 || row.endTimeUs != 1700000000000000 {
		t.Errorf("times: %d %d", row.startTimeUs, row.endTimeUs)
	}
}

func TestMalformedLeavesDegradeLikeSQLNulls(t *testing.T) {
	// every leaf here is wrong-typed; none of it may fail the file
	file := []byte(`[{
	  "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": 123}}]},
	  "scopeSpans": [{"scope": 7, "spans": [{
	    "traceId": 12345,
	    "spanId": {"type": "Buffer", "data": [0, 256]},
	    "kind": "SPAN_KIND_SERVER",
	    "startTimeUnixNano": "1700000000000000000",
	    "name": {"nested": true},
	    "status": {"message": 9},
	    "attributes": [
	      "not an object",
	      {"key": "langfuse.user.id", "value": 42},
	      {"key": "gen_ai.request.max_tokens", "value": {"intValue": 1.5}},
	      {"key": "ok", "value": {"stringValue": "fine"}}
	    ]
	  }]}]
	}]`)
	rows := transformCollect(t, "p", "b/k.json", file)
	if len(rows) != 1 {
		t.Fatalf("rows: %d", len(rows))
	}
	row := rows[0]
	for name, got := range map[string]string{
		"trace_id":       row.traceID,
		"span_id":        row.spanID,
		"name":           row.name,
		"status_message": row.statusMessage,
		"service_name":   row.serviceName,
		"scope_name":     row.scopeName,
		"user_id":        row.userID, // key still lifted, value degraded
	} {
		if got != "" {
			t.Errorf("%s: %q, want empty", name, got)
		}
	}
	if row.spanKind != 0 {
		t.Errorf("span kind: %d", row.spanKind)
	}
	// the garbage array element lands as ('','') like the SQL's NULL reads
	if !reflect.DeepEqual(row.metadataNames, []string{"", "gen_ai.request.max_tokens", "ok"}) {
		t.Errorf("metadata names: %v", row.metadataNames)
	}
	if !reflect.DeepEqual(row.metadataValues, []string{"", "", "fine"}) {
		t.Errorf("metadata values: %v", row.metadataValues)
	}
}

func TestIDEncodingsAndGarbage(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{`"ab01cd"`, "ab01cd"},
		{`{"type":"Buffer","data":[171,1,205]}`, "ab01cd"},
		// numeric id and out-of-range Buffer byte degrade instead of erroring
		{`12345`, ""},
		{`{"type":"Buffer","data":[0,256]}`, ""},
	}
	for _, c := range cases {
		var id otelID
		if err := json.Unmarshal([]byte(c.in), &id); err != nil {
			t.Fatalf("%s: %v", c.in, err)
		}
		if string(id) != c.want {
			t.Errorf("%s: got %q want %q", c.in, id, c.want)
		}
	}
}

func TestInt64AllEncodings(t *testing.T) {
	var r int64Repr
	mustParse := func(in string) *int64Repr {
		t.Helper()
		r = int64Repr{}
		if err := json.Unmarshal([]byte(in), &r); err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		return &r
	}

	s := mustParse(`"4096"`)
	if s.asI64() != 4096 || s.asU64() != 4096 {
		t.Errorf("string: %d %d", s.asI64(), s.asU64())
	}

	// negative low half: 0x1_FFFF_FFFB = 8589934587
	l := mustParse(`{"low":-5,"high":1,"unsigned":true}`)
	if l.asU64() != (1<<32)+4294967291 || l.asI64() != (1<<32)+4294967291 {
		t.Errorf("long: %d %d", l.asI64(), l.asU64())
	}

	if n := mustParse(`200`); n.asI64() != 200 {
		t.Errorf("num: %d", n.asI64())
	}
	if junk := mustParse(`1.5`); junk.asI64() != 0 {
		t.Errorf("junk: %d", junk.asI64())
	}
}

func TestLenientDegradesWrongTypes(t *testing.T) {
	var s lenientString
	if err := json.Unmarshal([]byte(`123`), &s); err != nil || s != "" {
		t.Errorf("string from number: %q %v", s, err)
	}
	var k lenientI64
	if err := json.Unmarshal([]byte(`"SPAN_KIND_SERVER"`), &k); err != nil || k != 0 {
		t.Errorf("i64 from string: %d %v", k, err)
	}
	// integer tokens still read as doubles (the top_p case)
	var d lenientF64
	if err := json.Unmarshal([]byte(`1`), &d); err != nil || d != 1.0 {
		t.Errorf("f64 from int: %v %v", d, err)
	}
	d = 0
	if err := json.Unmarshal([]byte(`"0.7"`), &d); err != nil || d != 0.0 {
		t.Errorf("f64 from string: %v %v", d, err)
	}
}

func TestEnvelopeStaysStrict(t *testing.T) {
	// files broken at the resourceSpans/scopeSpans/spans level are
	// dead-letter material, not degrade material
	for _, bad := range []string{
		`{"resourceSpans": []}`, // top level must be an array
		`["not an object"]`,
		`[{"scopeSpans": [{"spans": ["garbage"]}]}]`,
	} {
		if err := forEachResourceSpan([]byte(bad), func(*resourceSpan) {}); err == nil {
			t.Errorf("no error for %s", bad)
		}
	}
}
