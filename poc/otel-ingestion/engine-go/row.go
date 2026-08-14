// ch-go column blocks for eventRow: the Go equivalent of Rust's
// `#[derive(Row, Serialize)]` + RowBinary. ch-go is columnar, so instead of
// one derive this is an explicit column set + appendRow — more code, but the
// wire types (LowCardinality, Map with deterministic key order, named Tuple)
// are exact, which is what checksum parity needs.
package main

import (
	"github.com/ClickHouse/ch-go/proto"
)

type eventColumns struct {
	projectID            proto.ColStr
	traceID              proto.ColStr
	spanID               proto.ColStr
	parentSpanID         proto.ColStr
	startTime            *proto.ColDateTime64Raw
	endTime              *proto.ColNullable[proto.DateTime64]
	name                 proto.ColStr
	observationType      *proto.ColLowCardinality[string]
	environment          *proto.ColLowCardinality[string]
	version              proto.ColStr
	release              proto.ColStr
	traceName            proto.ColStr
	userID               proto.ColStr
	sessionID            proto.ColStr
	level                *proto.ColLowCardinality[string]
	statusMessage        proto.ColStr
	promptName           proto.ColStr
	promptVersion        *proto.ColNullable[uint16]
	providedModelName    proto.ColStr
	providedUsageDetails *proto.ColMap[string, uint64]
	usageDetails         *proto.ColMap[string, uint64]
	input                proto.ColStr
	output               proto.ColStr
	metadataNames        *proto.ColArr[string]
	metadataValues       *proto.ColArr[string]
	source               *proto.ColLowCardinality[string]
	serviceName          proto.ColStr
	serviceVersion       proto.ColStr
	scopeName            proto.ColStr
	scopeVersion         proto.ColStr
	telemetrySdkLanguage *proto.ColLowCardinality[string]
	telemetrySdkName     proto.ColStr
	telemetrySdkVersion  proto.ColStr
	blobStorageFilePath  proto.ColStr
	eventBytes           proto.ColUInt64
	spanKind             proto.ColUInt8
	hasMedia             proto.ColUInt8
	mediaManifest        colMediaManifest

	in proto.Input
}

func newEventColumns() *eventColumns {
	c := &eventColumns{
		startTime:            (&proto.ColDateTime64{}).WithPrecision(proto.PrecisionMicro).Raw(),
		endTime:              proto.NewColNullable[proto.DateTime64]((&proto.ColDateTime64{}).WithPrecision(proto.PrecisionMicro).Raw()),
		observationType:      proto.NewLowCardinality[string](new(proto.ColStr)),
		environment:          proto.NewLowCardinality[string](new(proto.ColStr)),
		level:                proto.NewLowCardinality[string](new(proto.ColStr)),
		promptVersion:        proto.NewColNullable[uint16](new(proto.ColUInt16)),
		providedUsageDetails: proto.NewMap[string, uint64](proto.NewLowCardinality[string](new(proto.ColStr)), new(proto.ColUInt64)),
		usageDetails:         proto.NewMap[string, uint64](proto.NewLowCardinality[string](new(proto.ColStr)), new(proto.ColUInt64)),
		metadataNames:        proto.NewArray[string](new(proto.ColStr)),
		metadataValues:       proto.NewArray[string](new(proto.ColStr)),
		source:               proto.NewLowCardinality[string](new(proto.ColStr)),
		telemetrySdkLanguage: proto.NewLowCardinality[string](new(proto.ColStr)),
	}
	c.in = proto.Input{
		{Name: "project_id", Data: &c.projectID},
		{Name: "trace_id", Data: &c.traceID},
		{Name: "span_id", Data: &c.spanID},
		{Name: "parent_span_id", Data: &c.parentSpanID},
		{Name: "start_time", Data: c.startTime},
		{Name: "end_time", Data: c.endTime},
		{Name: "name", Data: &c.name},
		{Name: "type", Data: c.observationType},
		{Name: "environment", Data: c.environment},
		{Name: "version", Data: &c.version},
		{Name: "release", Data: &c.release},
		{Name: "trace_name", Data: &c.traceName},
		{Name: "user_id", Data: &c.userID},
		{Name: "session_id", Data: &c.sessionID},
		{Name: "level", Data: c.level},
		{Name: "status_message", Data: &c.statusMessage},
		{Name: "prompt_name", Data: &c.promptName},
		{Name: "prompt_version", Data: c.promptVersion},
		{Name: "provided_model_name", Data: &c.providedModelName},
		{Name: "provided_usage_details", Data: c.providedUsageDetails},
		{Name: "usage_details", Data: c.usageDetails},
		{Name: "input", Data: &c.input},
		{Name: "output", Data: &c.output},
		{Name: "metadata_names", Data: c.metadataNames},
		{Name: "metadata_values", Data: c.metadataValues},
		{Name: "source", Data: c.source},
		{Name: "service_name", Data: &c.serviceName},
		{Name: "service_version", Data: &c.serviceVersion},
		{Name: "scope_name", Data: &c.scopeName},
		{Name: "scope_version", Data: &c.scopeVersion},
		{Name: "telemetry_sdk_language", Data: c.telemetrySdkLanguage},
		{Name: "telemetry_sdk_name", Data: &c.telemetrySdkName},
		{Name: "telemetry_sdk_version", Data: &c.telemetrySdkVersion},
		{Name: "blob_storage_file_path", Data: &c.blobStorageFilePath},
		{Name: "event_bytes", Data: &c.eventBytes},
		{Name: "span_kind", Data: &c.spanKind},
		{Name: "has_media", Data: &c.hasMedia},
		{Name: "media_manifest", Data: &c.mediaManifest},
	}
	return c
}

func (c *eventColumns) reset() {
	c.in.Reset()
}

func (c *eventColumns) appendRow(r *eventRow) {
	c.projectID.Append(r.projectID)
	c.traceID.Append(r.traceID)
	c.spanID.Append(r.spanID)
	c.parentSpanID.Append(r.parentSpanID)
	c.startTime.Append(proto.DateTime64(r.startTimeUs))
	c.endTime.Append(proto.NewNullable(proto.DateTime64(r.endTimeUs)))
	c.name.Append(r.name)
	c.observationType.Append(r.observationType)
	c.environment.Append(r.environment)
	c.version.Append(r.version)
	c.release.Append(r.release)
	c.traceName.Append(r.traceName)
	c.userID.Append(r.userID)
	c.sessionID.Append(r.sessionID)
	c.level.Append(r.level)
	c.statusMessage.Append(r.statusMessage)
	c.promptName.Append(r.promptName)
	if r.promptVersionSet {
		c.promptVersion.Append(proto.NewNullable(r.promptVersion))
	} else {
		c.promptVersion.Append(proto.Null[uint16]())
	}
	c.providedModelName.Append(r.providedModelName)
	appendUsage(c.providedUsageDetails, r.usage)
	appendUsage(c.usageDetails, r.usage)
	c.input.Append(r.input)
	c.output.Append(r.output)
	c.metadataNames.Append(r.metadataNames)
	c.metadataValues.Append(r.metadataValues)
	c.source.Append(r.source)
	c.serviceName.Append(r.serviceName)
	c.serviceVersion.Append(r.serviceVersion)
	c.scopeName.Append(r.scopeName)
	c.scopeVersion.Append(r.scopeVersion)
	c.telemetrySdkLanguage.Append(r.telemetrySdkLanguage)
	c.telemetrySdkName.Append(r.telemetrySdkName)
	c.telemetrySdkVersion.Append(r.telemetrySdkVersion)
	c.blobStorageFilePath.Append(r.blobStorageFilePath)
	c.eventBytes.Append(r.eventBytes)
	c.spanKind.Append(r.spanKind)
	c.hasMedia.Append(r.hasMedia)
	c.mediaManifest.Append(r.mediaManifest)
}

// appendUsage keeps the Vec order (Go's map type would randomize it, and
// toString(Map) — the parity checksum — is order-sensitive).
func appendUsage(m *proto.ColMap[string, uint64], kvs []usageKV) {
	pairs := make([]proto.KV[string, uint64], len(kvs))
	for i, kv := range kvs {
		pairs[i] = proto.KV[string, uint64]{Key: kv.key, Value: kv.val}
	}
	m.AppendKV(pairs)
}

// colMediaManifest is Array(Tuple(...)) — ch-go has no generic tuple column,
// so this implements proto.ColInput by hand: array offsets first, then each
// tuple element column in declaration order (the native wire layout).
type colMediaManifest struct {
	offsets     proto.ColUInt64
	mediaID     proto.ColStr
	contentType proto.ColStr
	field       proto.ColStr
	byteOffset  proto.ColUInt32
	byteLength  proto.ColUInt32
}

func (c *colMediaManifest) Type() proto.ColumnType {
	return proto.ColumnType("Array(Tuple(media_id String, content_type String, field String, byte_offset UInt32, byte_length UInt32))")
}

func (c *colMediaManifest) Rows() int { return c.offsets.Rows() }

func (c *colMediaManifest) Append(refs []mediaRef) {
	for _, m := range refs {
		c.mediaID.Append(m.mediaID)
		c.contentType.Append(m.contentType)
		c.field.Append(m.field)
		c.byteOffset.Append(m.byteOffset)
		c.byteLength.Append(m.byteLength)
	}
	c.offsets = append(c.offsets, uint64(c.mediaID.Rows()))
}

func (c *colMediaManifest) EncodeColumn(b *proto.Buffer) {
	c.offsets.EncodeColumn(b)
	c.mediaID.EncodeColumn(b)
	c.contentType.EncodeColumn(b)
	c.field.EncodeColumn(b)
	c.byteOffset.EncodeColumn(b)
	c.byteLength.EncodeColumn(b)
}

func (c *colMediaManifest) WriteColumn(w *proto.Writer) {
	c.offsets.WriteColumn(w)
	c.mediaID.WriteColumn(w)
	c.contentType.WriteColumn(w)
	c.field.WriteColumn(w)
	c.byteOffset.WriteColumn(w)
	c.byteLength.WriteColumn(w)
}

func (c *colMediaManifest) Reset() {
	c.offsets.Reset()
	c.mediaID.Reset()
	c.contentType.Reset()
	c.field.Reset()
	c.byteOffset.Reset()
	c.byteLength.Reset()
}
