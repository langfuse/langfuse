// Package wire converts normalized ClickHouse rows into the v2 observations
// API response shape, porting convertEventsObservation /
// convertObservationPartial (observations_converters.ts) plus the route-level
// transforms in web/src/pages/api/public/v2/observations/index.ts.
package wire

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"github.com/langfuse/langfuse/go/observations-api/internal/enrich"
)

// ToJSISOString formats like JS Date.prototype.toISOString(): UTC, exactly
// three fractional digits.
func ToJSISOString(t time.Time) string {
	return t.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
}

// parseJSONPrioritised ports parseJsonPrioritised: JSON-parse with numeric
// precision preserved; unparsable strings pass through unchanged.
func parseJSONPrioritised(s string) any {
	dec := json.NewDecoder(strings.NewReader(s))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return s
	}
	// JSON.parse rejects trailing content.
	if dec.More() {
		return s
	}
	return v
}

func timeOrNil(v any) (time.Time, bool) {
	t, ok := v.(time.Time)
	return t, ok
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case uint64:
		return float64(n)
	case int64:
		return float64(n)
	case uint32:
		return float64(n)
	case int32:
		return float64(n)
	case float64:
		return n
	case float32:
		return float64(n)
	case uint16:
		return float64(n)
	case uint8:
		return float64(n)
	case int16:
		return float64(n)
	case int8:
		return float64(n)
	case int:
		return float64(n)
	case uint:
		return float64(n)
	case decimal.Decimal:
		f, _ := n.Float64()
		return f
	}
	return 0
}

// numericDetails converts a ClickHouse Map column into a JSON-safe
// map[string]float64 (convertNumericRecord parity).
func numericDetails(v any) map[string]float64 {
	out := map[string]float64{}
	switch m := v.(type) {
	case map[string]uint64:
		for k, val := range m {
			out[k] = float64(val)
		}
	case map[string]decimal.Decimal:
		for k, val := range m {
			f, _ := val.Float64()
			out[k] = f
		}
	case map[string]float64:
		for k, val := range m {
			out[k] = val
		}
	}
	return out
}

// reduceDetails ports reduceUsageOrCostDetails.
func reduceDetails(details map[string]float64) (input, output any, total float64) {
	var inputSum, outputSum *float64
	for k, v := range details {
		if strings.HasPrefix(k, "input") {
			if inputSum == nil {
				zero := 0.0
				inputSum = &zero
			}
			*inputSum += v
		}
		if strings.HasPrefix(k, "output") {
			if outputSum == nil {
				zero := 0.0
				outputSum = &zero
			}
			*outputSum += v
		}
	}
	input, output = nil, nil
	if inputSum != nil {
		input = *inputSum
	}
	if outputSum != nil {
		output = *outputSum
	}
	total = details["total"]
	return input, output, total
}

// applyIORendering ports applyInputOutputRendering with shouldJsonParse=false:
// falsy (empty) IO becomes null, everything else stays a raw string.
func applyIORendering(v any) any {
	s, ok := v.(string)
	if !ok || s == "" {
		return nil
	}
	return s
}

func nilOrString(v any) any {
	if v == nil {
		return nil
	}
	if s, ok := v.(string); ok {
		return s
	}
	return nil
}

// RowToAPIObservation converts one row. model is nil when the "model" field
// group was not requested or the model did not resolve.
func RowToAPIObservation(row map[string]any, model *enrich.ModelPrices) map[string]any {
	out := map[string]any{}

	// --- Core fields (always present) ---
	out["id"] = row["id"]
	out["traceId"] = row["trace_id"]
	out["projectId"] = row["project_id"]
	out["type"] = row["type"]

	startTime, hasStart := timeOrNil(row["start_time"])
	if hasStart {
		out["startTime"] = ToJSISOString(startTime)
	}
	endTime, hasEnd := timeOrNil(row["end_time"])
	if _, present := row["end_time"]; present {
		if hasEnd {
			out["endTime"] = ToJSISOString(endTime)
		} else {
			out["endTime"] = nil
		}
	}
	// Route transform: empty parent_observation_id -> null (v1 parity).
	if parent, present := row["parent_observation_id"]; present {
		if s, ok := parent.(string); ok && s != "" {
			out["parentObservationId"] = s
		} else {
			out["parentObservationId"] = nil
		}
	}

	// --- Basic fields ---
	if v, present := row["name"]; present {
		out["name"] = v
	}
	if v, present := row["level"]; present {
		out["level"] = v
	}
	if v, present := row["status_message"]; present {
		out["statusMessage"] = v
	}
	if v, present := row["version"]; present {
		out["version"] = v
	}
	if v, present := row["environment"]; present {
		out["environment"] = v
	}
	if v, present := row["bookmarked"]; present {
		out["bookmarked"] = v
	}
	if v, present := row["public"]; present {
		out["public"] = v
	}
	if v, present := row["user_id"]; present {
		out["userId"] = v
	}
	if v, present := row["session_id"]; present {
		out["sessionId"] = v
	}

	// --- Time fields ---
	if v, present := row["completion_start_time"]; present {
		if t, ok := timeOrNil(v); ok {
			out["completionStartTime"] = ToJSISOString(t)
		} else {
			out["completionStartTime"] = nil
		}
	}
	if v, present := row["created_at"]; present {
		if t, ok := timeOrNil(v); ok {
			out["createdAt"] = ToJSISOString(t)
		}
	}
	if v, present := row["updated_at"]; present {
		if t, ok := timeOrNil(v); ok {
			out["updatedAt"] = ToJSISOString(t)
		}
	}

	// --- IO fields (raw strings; empty -> null) ---
	if v, present := row["input"]; present {
		out["input"] = applyIORendering(v)
	}
	if v, present := row["output"]; present {
		out["output"] = applyIORendering(v)
	}

	// --- Metadata ---
	if v, present := row["metadata"]; present {
		metadata := map[string]any{}
		if m, ok := v.(map[string]string); ok {
			for key, val := range m {
				metadata[key] = parseJSONPrioritised(val)
			}
		}
		out["metadata"] = metadata
	}

	// --- Model fields ---
	if v, present := row["provided_model_name"]; present {
		out["model"] = v
	}
	if v, present := row["internal_model_id"]; present {
		out["internalModelId"] = v
	}
	if v, present := row["model_parameters"]; present {
		if s, ok := v.(string); ok && s != "" {
			out["modelParameters"] = parseJSONPrioritised(s)
		} else {
			out["modelParameters"] = nil
		}
	}

	// --- Usage fields ---
	if v, present := row["usage_details"]; present {
		details := numericDetails(v)
		out["usageDetails"] = details
		input, output, total := reduceDetails(details)
		out["inputUsage"] = orZero(input)
		out["outputUsage"] = orZero(output)
		out["totalUsage"] = total
	}
	if v, present := row["cost_details"]; present {
		details := numericDetails(v)
		out["costDetails"] = details
		input, output, total := reduceDetails(details)
		out["inputCost"] = input
		out["outputCost"] = output
		out["totalCost"] = total
	}
	if v, present := row["usage_pricing_tier_id"]; present {
		out["usagePricingTierId"] = nilOrString(v)
	}
	if v, present := row["usage_pricing_tier_name"]; present {
		out["usagePricingTierName"] = nilOrString(v)
	}

	// --- Prompt fields ---
	if v, present := row["prompt_id"]; present {
		out["promptId"] = v
	}
	if v, present := row["prompt_name"]; present {
		out["promptName"] = v
	}
	if v, present := row["prompt_version"]; present {
		// JS truthiness: 0 and null both map to null.
		version := asFloat(orZeroValue(v))
		if v == nil || version == 0 {
			out["promptVersion"] = nil
		} else {
			out["promptVersion"] = version
		}
	}

	// --- Metrics: converter values, then ClickHouse override (enrichObservationsWithModelData) ---
	var convertedLatency any = nil
	if hasStart {
		if _, present := row["end_time"]; present || hasStart {
			if hasEnd {
				convertedLatency = float64(endTime.UnixMilli()-startTime.UnixMilli()) / 1000
			}
		}
	}
	var convertedTTFT any = nil
	if cst, ok := timeOrNil(row["completion_start_time"]); ok && hasStart {
		convertedTTFT = float64(cst.UnixMilli()-startTime.UnixMilli()) / 1000
	}

	if v, present := row["latency"]; present {
		out["latency"] = chDurationOverride(v)
	} else {
		out["latency"] = convertedLatency
	}
	if v, present := row["time_to_first_token"]; present {
		out["timeToFirstToken"] = chDurationOverride(v)
	} else {
		out["timeToFirstToken"] = convertedTTFT
	}

	// --- Trace context ---
	if v, present := row["tags"]; present {
		out["tags"] = v
	}
	if v, present := row["release"]; present {
		out["release"] = v
	}
	if v, present := row["trace_name"]; present {
		out["traceName"] = v
	}

	// --- Enrichment fields (always present on v2 responses) ---
	if model != nil {
		out["modelId"] = model.ID
		out["inputPrice"] = priceString(model.InputPrice)
		out["outputPrice"] = priceString(model.OutputPrice)
		out["totalPrice"] = priceString(model.TotalPrice)
	} else {
		out["modelId"] = nil
		out["inputPrice"] = nil
		out["outputPrice"] = nil
		out["totalPrice"] = nil
	}

	return out
}

// chDurationOverride ports the ClickHouse latency override:
// `o.latency ? Number(o.latency) / 1000 : null` — 0ms and NULL both map to null.
func chDurationOverride(v any) any {
	if v == nil {
		return nil
	}
	ms := asFloat(v)
	if ms == 0 {
		return nil
	}
	return ms / 1000
}

func orZero(v any) any {
	if v == nil {
		return 0.0
	}
	return v
}

func orZeroValue(v any) any {
	if v == nil {
		return 0.0
	}
	return v
}

func priceString(d *decimal.Decimal) any {
	if d == nil {
		return nil
	}
	return DecimalJSString(*d)
}

// DecimalJSString formats a decimal like decimal.js's toString() (which
// backs Prisma.Decimal): plain notation with trailing zeros trimmed, or
// exponential notation when the decimal exponent is < -7 or >= 21.
func DecimalJSString(d decimal.Decimal) string {
	if d.IsZero() {
		return "0"
	}

	neg := d.IsNegative()
	abs := d.Abs()

	// digits: coefficient without leading/trailing zeros; exp: decimal
	// exponent of the first significant digit (floor(log10(abs))).
	plain := abs.String() // shopspring may keep trailing zeros; handle below
	digits, exp := normalizeDigits(plain)

	var body string
	if exp <= -7 || exp >= 21 {
		// exponential form, e.g. "2.5e-8" / "1e+21"
		mantissa := digits[:1]
		if len(digits) > 1 {
			mantissa += "." + digits[1:]
		}
		sign := "+"
		e := exp
		if e < 0 {
			sign = "-"
			e = -e
		}
		body = mantissa + "e" + sign + itoa(e)
	} else if exp >= 0 {
		intLen := exp + 1
		if len(digits) <= intLen {
			body = digits + strings.Repeat("0", intLen-len(digits))
		} else {
			body = digits[:intLen] + "." + digits[intLen:]
		}
	} else {
		body = "0." + strings.Repeat("0", -exp-1) + digits
	}

	if neg {
		return "-" + body
	}
	return body
}

// normalizeDigits extracts significant digits and the decimal exponent from
// a plain decimal string like "0.000250" or "1234.5".
func normalizeDigits(plain string) (string, int) {
	intPart, fracPart, hasFrac := strings.Cut(plain, ".")
	if !hasFrac {
		fracPart = ""
	}
	all := intPart + fracPart
	// exponent of the leading digit relative to the decimal point
	firstSig := strings.IndexFunc(all, func(r rune) bool { return r != '0' })
	if firstSig == -1 {
		return "0", 0
	}
	exp := len(intPart) - 1 - firstSig
	digits := strings.TrimRight(all[firstSig:], "0")
	if digits == "" {
		digits = "0"
	}
	return digits, exp
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var b [8]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}
