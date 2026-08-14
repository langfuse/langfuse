// The transform: one raw batch payload (a JSON array of resourceSpans — that
// it arrives as an S3 object is the caller's business) -> events rows. Same
// scope as engine-ch/sql/transform-v2.sql and a line-for-line sibling of
// engine-rust/src/transform.rs.
package main

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const metadataPrefix = "langfuse.observation.metadata."

// One media_manifest entry; offsets point into the ORIGINAL field value so
// the async uploader can re-slice the raw S3 file.
type mediaRef struct {
	mediaID     string
	contentType string
	field       string
	byteOffset  uint32
	byteLength  uint32
}

type usageKV struct {
	key string
	val uint64
}

// eventRow carries the same column set sql/transform-v2.sql inserts, minus
// event_ts (left to the column DEFAULT now64(6) in both engines).
type eventRow struct {
	projectID            string
	traceID              string
	spanID               string
	parentSpanID         string
	startTimeUs          int64 // DateTime64(6) ticks
	endTimeUs            int64 // Nullable(DateTime64(6)); always set, like Rust
	name                 string
	observationType      string // column "type"
	environment          string
	version              string
	release              string
	traceName            string
	userID               string
	sessionID            string
	level                string
	statusMessage        string
	promptName           string
	promptVersion        uint16 // NULL when promptVersionSet is false
	promptVersionSet     bool
	providedModelName    string
	usage                []usageKV // written to both usage_details columns
	input                string
	output               string
	metadataNames        []string
	metadataValues       []string
	source               string
	serviceName          string
	serviceVersion       string
	scopeName            string
	scopeVersion         string
	telemetrySdkLanguage string
	telemetrySdkName     string
	telemetrySdkVersion  string
	blobStorageFilePath  string
	eventBytes           uint64
	spanKind             uint8
	hasMedia             uint8
	mediaManifest        []mediaRef
}

// transformBatch hands rows to sink the moment they exist; resourceSpans are
// dropped one at a time (see forEachResourceSpan).
func transformBatch(projectID, blobPath string, data []byte, sink func(*eventRow)) error {
	return forEachResourceSpan(data, func(rs *resourceSpan) {
		res := resourceFieldsFrom(rs.Resource.V.Attributes)
		for i := range rs.ScopeSpans {
			ss := &rs.ScopeSpans[i]
			scopeName := string(ss.Scope.V.Name)
			scopeVersion := string(ss.Scope.V.Version)
			for j := range ss.Spans {
				sink(spanToRow(&ss.Spans[j], &res, scopeName, scopeVersion, projectID, blobPath))
			}
		}
	})
}

// Resource-level fields lifted into every row of the batch.
type resourceFields struct {
	serviceName          string
	serviceVersion       string
	telemetrySdkLanguage string
	telemetrySdkName     string
	telemetrySdkVersion  string
	environment          string
}

func resourceFieldsFrom(attrs []lenientObj[keyValue]) resourceFields {
	var f resourceFields
	for i := range attrs {
		kv := &attrs[i].V
		sval := string(kv.Value.V.StringValue)
		switch string(kv.Key) {
		case "service.name":
			f.serviceName = sval
		case "service.version":
			f.serviceVersion = sval
		case "telemetry.sdk.language":
			f.telemetrySdkLanguage = sval
		case "telemetry.sdk.name":
			f.telemetrySdkName = sval
		case "telemetry.sdk.version":
			f.telemetrySdkVersion = sval
		case "deployment.environment":
			f.environment = sval
		}
	}
	if f.environment == "" {
		f.environment = "default"
	}
	return f
}

// Span-level attributes lifted into dedicated columns; the switch arms in
// spanToRow are the single source of truth for which keys are lifted.
type lifted struct {
	observationType   string
	providedModelName string
	userID            string
	sessionID         string
	traceName         string
	release           string
	version           string
	level             string
	promptName        string
	promptVersion     int64
	usageInput        int64
	usageOutput       int64
	usageTotal        int64
	input             string
	output            string
}

func spanToRow(s *span, res *resourceFields, scopeName, scopeVersion, projectID, blobPath string) *eventRow {
	var startNs, endNs uint64
	if s.StartTimeUnixNano != nil {
		startNs = s.StartTimeUnixNano.asU64()
	}
	if s.EndTimeUnixNano != nil {
		endNs = s.EndTimeUnixNano.asU64()
	}
	name := string(s.Name)

	var l lifted
	var metadataNames, metadataValues []string

	for i := range s.Attributes {
		kv := &s.Attributes[i].V
		v := &kv.Value.V
		// the three typed lanes, exactly as the SQL reads them
		sval := string(v.StringValue)
		var ival int64
		if v.IntValue != nil {
			ival = v.IntValue.asI64()
		}
		dval := float64(v.DoubleValue)
		key := string(kv.Key)

		switch key {
		case "langfuse.observation.type":
			l.observationType = sval
		case "gen_ai.request.model":
			l.providedModelName = sval
		case "langfuse.user.id":
			l.userID = sval
		case "langfuse.session.id":
			l.sessionID = sval
		case "langfuse.trace.name":
			l.traceName = sval
		case "langfuse.release":
			l.release = sval
		case "langfuse.version":
			l.version = sval
		case "langfuse.observation.level":
			l.level = sval
		case "langfuse.prompt.name":
			l.promptName = sval
		case "langfuse.observation.input":
			l.input = sval
		case "langfuse.observation.output":
			l.output = sval
		case "langfuse.prompt.version":
			l.promptVersion = ival
		case "gen_ai.usage.input_tokens":
			l.usageInput = ival
		case "gen_ai.usage.output_tokens":
			l.usageOutput = ival
		case "gen_ai.usage.total_tokens":
			l.usageTotal = ival
		default:
			metadataNames = append(metadataNames, strings.TrimPrefix(key, metadataPrefix))
			var mv string
			switch {
			case sval != "":
				mv = sval
			case ival != 0:
				mv = strconv.FormatInt(ival, 10)
			case dval != 0.0:
				// like Rust's Display: shortest round-trip decimal, no exponent
				mv = strconv.FormatFloat(dval, 'f', -1, 64)
			}
			metadataValues = append(metadataValues, mv)
		}
	}

	input, mediaManifest := extractMedia(l.input)

	var usage []usageKV
	for _, u := range []struct {
		k string
		v int64
	}{{"input", l.usageInput}, {"output", l.usageOutput}, {"total", l.usageTotal}} {
		if u.v > 0 {
			usage = append(usage, usageKV{u.k, uint64(u.v)})
		}
	}

	eventBytes := uint64(len(input) + len(l.output) + len(name))
	for _, mv := range metadataValues {
		eventBytes += uint64(len(mv))
	}

	row := &eventRow{
		projectID:            projectID,
		startTimeUs:          int64(startNs) / 1000,
		endTimeUs:            int64(endNs) / 1000,
		name:                 name,
		observationType:      l.observationType,
		environment:          res.environment,
		version:              l.version,
		release:              l.release,
		traceName:            l.traceName,
		userID:               l.userID,
		sessionID:            l.sessionID,
		level:                l.level,
		statusMessage:        string(s.Status.V.Message),
		promptName:           l.promptName,
		providedModelName:    l.providedModelName,
		usage:                usage,
		input:                input,
		output:               l.output,
		metadataNames:        metadataNames,
		metadataValues:       metadataValues,
		source:               "otel",
		serviceName:          res.serviceName,
		serviceVersion:       res.serviceVersion,
		scopeName:            scopeName,
		scopeVersion:         scopeVersion,
		telemetrySdkLanguage: res.telemetrySdkLanguage,
		telemetrySdkName:     res.telemetrySdkName,
		telemetrySdkVersion:  res.telemetrySdkVersion,
		blobStorageFilePath:  blobPath,
		eventBytes:           eventBytes,
		spanKind:             uint8(int64(s.Kind)),
		hasMedia:             boolToU8(len(mediaManifest) > 0),
		mediaManifest:        mediaManifest,
	}
	if s.TraceID != nil {
		row.traceID = string(*s.TraceID)
	}
	if s.SpanID != nil {
		row.spanID = string(*s.SpanID)
	}
	if s.ParentSpanID != nil {
		row.parentSpanID = string(*s.ParentSpanID)
	}
	if l.promptVersion != 0 {
		row.promptVersion, row.promptVersionSet = uint16(l.promptVersion), true
	}
	return row
}

func boolToU8(b bool) uint8 {
	if b {
		return 1
	}
	return 0
}

var mediaRe = regexp.MustCompile(`data:([a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)`)

// extractMedia cuts data URIs out of the field value: each match becomes a
// media token in the stored payload plus a manifest entry whose offsets
// point into the ORIGINAL value.
func extractMedia(input string) (string, []mediaRef) {
	if !strings.Contains(input, ";base64,") {
		return input, nil
	}
	matches := mediaRe.FindAllStringSubmatchIndex(input, -1)
	if len(matches) == 0 {
		return input, nil
	}
	var out strings.Builder
	out.Grow(len(input))
	manifest := make([]mediaRef, 0, len(matches))
	last := 0
	for _, m := range matches {
		start, end := m[0], m[1]
		contentType := input[m[2]:m[3]]
		// undecodable base64 hashes as empty, same as Rust's unwrap_or_default
		decoded, err := base64.StdEncoding.DecodeString(input[m[4]:m[5]])
		if err != nil {
			decoded = nil
		}
		sum := sha256.Sum256(decoded)
		mediaID := base64.URLEncoding.EncodeToString(sum[:])
		out.WriteString(input[last:start])
		fmt.Fprintf(&out, "@@@langfuseMedia:type=%s|id=%s|source=base64_data_uri@@@", contentType, mediaID)
		manifest = append(manifest, mediaRef{
			mediaID:     mediaID,
			contentType: contentType,
			field:       "input",
			byteOffset:  uint32(start),
			byteLength:  uint32(end - start),
		})
		last = end
	}
	out.WriteString(input[last:])
	return out.String(), manifest
}

// projectFromKey mirrors Path A's `extract(_path, 'otel-poc[^/]*/([^/]+)/')`.
func projectFromKey(key string) string {
	segments := strings.Split(key, "/")
	for i, s := range segments {
		if strings.HasPrefix(s, "otel-poc") {
			if i+1 < len(segments) {
				return segments[i+1]
			}
			return ""
		}
	}
	return ""
}
