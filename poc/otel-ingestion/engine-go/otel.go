// Wire model of the raw OTel export files, mirroring engine-rust/src/otel.rs:
// both real-world encodings absorbed in one type each (protobuf-decoded
// Buffers/protobufjs Longs, and OTLP/JSON hex/decimal strings), leaf fields
// lenient by construction, envelope arrays strict.
//
// Built on encoding/json/v2 (via its go-json-experiment polyfill module):
// UnmarshalJSONFrom hands each lenient type the live jsontext.Decoder, so
// PeekKind() dispatches on the next token's shape BEFORE parsing and every
// accepted value is materialized exactly once — the same single-pass
// property Rust's hand-written serde visitor has, in a fraction of the code.
// The first cut used stdlib encoding/json UnmarshalJSON instead; its nested
// json.Unmarshal calls re-validate their subtree, and that re-scanning was
// ~half of worker CPU (see EXPERIMENTS.md).
package main

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strconv"

	json "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

// lenientObj accepts a JSON object; any other shape degrades to T's zero
// value instead of failing the file. This is the poison-pill guard: one
// malformed attribute must not wedge a whole batch in retry-forever, and the
// degraded result (” / 0) is exactly what the SQL path's NULL-propagating
// reads produce for the same input — which is what keeps checksum parity.
type lenientObj[T any] struct{ V T }

func (l *lenientObj[T]) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	var zero T
	l.V = zero
	if dec.PeekKind() == '{' {
		return json.UnmarshalDecode(dec, &l.V)
	}
	return dec.SkipValue()
}

// lenientString accepts a JSON string; wrong shapes degrade to "".
type lenientString string

func (s *lenientString) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	*s = ""
	if dec.PeekKind() == '"' {
		var v string
		if err := json.UnmarshalDecode(dec, &v); err != nil {
			return err
		}
		*s = lenientString(v)
		return nil
	}
	return dec.SkipValue()
}

// lenientF64 accepts any JSON number (integer tokens read as floats — the
// top_p=1 case); wrong shapes degrade to 0.
type lenientF64 float64

func (f *lenientF64) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	*f = 0
	if dec.PeekKind() != '0' { // jsontext.Kind '0' is any JSON number
		return dec.SkipValue()
	}
	raw, err := dec.ReadValue()
	if err != nil {
		return err
	}
	if v, err := strconv.ParseFloat(string(raw), 64); err == nil {
		*f = lenientF64(v)
	}
	return nil
}

// lenientI64 accepts a JSON integer; floats do not read as ints (matching
// the SQL's `.:Int64`), and anything else degrades to 0.
type lenientI64 int64

func (n *lenientI64) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	*n = 0
	if dec.PeekKind() != '0' {
		return dec.SkipValue()
	}
	raw, err := dec.ReadValue()
	if err != nil {
		return err
	}
	if v, err := strconv.ParseInt(string(raw), 10, 64); err == nil {
		*n = lenientI64(v)
	}
	return nil
}

// otelID is a span/trace id: hex string taken as-is, or protobufjs Buffer
// JSON re-hexed. Anything else (including out-of-range Buffer bytes)
// degrades to "".
type otelID string

func (id *otelID) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	*id = ""
	switch dec.PeekKind() {
	case '"':
		var s string
		if err := json.UnmarshalDecode(dec, &s); err != nil {
			return err
		}
		*id = otelID(s)
		return nil
	case '{':
		// Buffer objects are tiny; buffering just this value keeps the
		// wrong-shape degrade simple (a half-consumed streaming decode
		// could not be recovered)
		raw, err := dec.ReadValue()
		if err != nil {
			return err
		}
		var buf struct {
			Data *[]int64 `json:"data"`
		}
		if err := json.Unmarshal(raw, &buf); err != nil || buf.Data == nil {
			return nil
		}
		b := make([]byte, len(*buf.Data))
		for i, v := range *buf.Data {
			if v < 0 || v > 255 {
				return nil
			}
			b[i] = byte(v)
		}
		*id = otelID(hex.EncodeToString(b))
		return nil
	}
	return dec.SkipValue()
}

// int64Repr is a 64-bit integer in any transport encoding: decimal string,
// protobufjs Long (signed int32 halves), or plain JSON integer. The encoding
// is kept, not eagerly converted, because the two read lanes differ: the
// string form parses per-lane (u64 range for timestamps, i64 for attribute
// ints), exactly like the Rust enum.
type int64Repr struct {
	kind      int8 // reprNone = garbage/absent
	str       string
	low, high int64
	num       int64
}

const (
	reprNone int8 = iota
	reprStr
	reprLong
	reprNum
)

func (r *int64Repr) UnmarshalJSONFrom(dec *jsontext.Decoder) error {
	*r = int64Repr{}
	switch dec.PeekKind() {
	case '"':
		var s string
		if err := json.UnmarshalDecode(dec, &s); err != nil {
			return err
		}
		r.kind, r.str = reprStr, s
		return nil
	case '{':
		raw, err := dec.ReadValue() // tiny, like the Buffer case above
		if err != nil {
			return err
		}
		var l struct {
			Low  *int64 `json:"low"`
			High *int64 `json:"high"`
		}
		if err := json.Unmarshal(raw, &l); err != nil || l.Low == nil || l.High == nil {
			return nil // wrong-shaped halves degrade, like untagged Other
		}
		r.kind, r.low, r.high = reprLong, *l.Low, *l.High
		return nil
	case '0':
		raw, err := dec.ReadValue()
		if err != nil {
			return err
		}
		n, perr := strconv.ParseInt(string(raw), 10, 64)
		if perr != nil {
			return nil // float or out-of-i64-range token degrades
		}
		r.kind, r.num = reprNum, n
		return nil
	}
	return dec.SkipValue()
}

// asI64 is the attribute intValue lane (SQL: toInt64OrZero / Long math on Int64).
func (r *int64Repr) asI64() int64 {
	switch r.kind {
	case reprStr:
		v, err := strconv.ParseInt(r.str, 10, 64)
		if err != nil {
			return 0
		}
		return v
	case reprLong:
		return r.high<<32 + (r.low & 0xFFFF_FFFF)
	case reprNum:
		return r.num
	}
	return 0
}

// asU64 is the timestamp lane (SQL: toUInt64OrZero / Long math on UInt64).
func (r *int64Repr) asU64() uint64 {
	switch r.kind {
	case reprStr:
		v, err := strconv.ParseUint(r.str, 10, 64)
		if err != nil {
			return 0
		}
		return v
	case reprLong:
		return uint64(r.high)<<32 | uint64(uint32(r.low))
	case reprNum:
		if r.num < 0 {
			return 0
		}
		return uint64(r.num)
	}
	return 0
}

type resourceSpan struct {
	Resource   lenientObj[resource] `json:"resource"`
	ScopeSpans []scopeSpan          `json:"scopeSpans"`
}

type resource struct {
	Attributes []lenientObj[keyValue] `json:"attributes"`
}

type scopeSpan struct {
	Scope lenientObj[scope] `json:"scope"`
	Spans []span            `json:"spans"`
}

type scope struct {
	Name    lenientString `json:"name"`
	Version lenientString `json:"version"`
}

type span struct {
	TraceID      *otelID       `json:"traceId"`
	SpanID       *otelID       `json:"spanId"`
	ParentSpanID *otelID       `json:"parentSpanId"`
	Name         lenientString `json:"name"`
	// OTLP/JSON may encode enums as strings ("SPAN_KIND_SERVER"); like the
	// SQL's `.:Int64`, anything non-integer reads as 0
	Kind              lenientI64             `json:"kind"`
	StartTimeUnixNano *int64Repr             `json:"startTimeUnixNano"`
	EndTimeUnixNano   *int64Repr             `json:"endTimeUnixNano"`
	Attributes        []lenientObj[keyValue] `json:"attributes"`
	Status            lenientObj[status]     `json:"status"`
}

type status struct {
	Message lenientString `json:"message"`
}

type keyValue struct {
	Key   lenientString        `json:"key"`
	Value lenientObj[anyValue] `json:"value"`
}

type anyValue struct {
	StringValue lenientString `json:"stringValue"`
	IntValue    *int64Repr    `json:"intValue"`
	DoubleValue lenientF64    `json:"doubleValue"`
}

// forEachResourceSpan parses a batch payload — a JSON array of resourceSpans
// — invoking f on each element as soon as it is decoded and dropping it
// before the next one is read. Streaming keeps peak memory at "raw bytes +
// one resourceSpan" regardless of batch size.
func forEachResourceSpan(data []byte, f func(*resourceSpan)) error {
	dec := jsontext.NewDecoder(bytes.NewReader(data))
	if k := dec.PeekKind(); k != '[' {
		return fmt.Errorf("expected a JSON array of resourceSpans, got %v", k)
	}
	if _, err := dec.ReadToken(); err != nil { // consume '['
		return err
	}
	var rs resourceSpan
	for dec.PeekKind() != ']' {
		rs = resourceSpan{}
		if err := json.UnmarshalDecode(dec, &rs); err != nil {
			return err
		}
		f(&rs)
	}
	if _, err := dec.ReadToken(); err != nil { // consume ']'
		return err
	}
	if _, err := dec.ReadToken(); !errors.Is(err, io.EOF) {
		return errors.New("trailing data after resourceSpans array")
	}
	return nil
}
