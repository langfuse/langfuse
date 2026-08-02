package query

import (
	"encoding/json"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

// AdvancedFilter is a validated eventsTableSingleFilter
// (packages/shared/src/interfaces/filters.ts).
type AdvancedFilter struct {
	Type     string
	Column   string
	Operator string
	Key      string // stringObject / numberObject / booleanObject / categoryOptions / positionInTrace

	StringValue string
	NumberValue float64
	BoolValue   bool
	ArrayValue  []string
	TimeValue   time.Time
	// HasValue tracks the optional value of positionInTrace filters.
	HasValue bool
}

var operatorSets = map[string][]string{
	"datetime":        {">", "<", ">=", "<="},
	"string":          {"=", "contains", "does not contain", "starts with", "ends with"},
	"stringOptions":   {"any of", "none of"},
	"categoryOptions": {"any of", "none of"},
	"arrayOptions":    {"any of", "none of", "all of"},
	"number":          {"=", ">", "<", ">=", "<="},
	"stringObject":    {"=", "contains", "does not contain", "starts with", "ends with"},
	"numberObject":    {"=", ">", "<", ">=", "<="},
	"booleanObject":   {"=", "<>"},
	"boolean":         {"=", "<>"},
	"null":            {"is null", "is not null"},
}

// ftsUnionTypes get "matches" as an extra union branch on events tables.
var ftsUnionTypes = map[string]bool{"string": true, "stringObject": true}

func operatorAllowed(filterType, operator string) bool {
	for _, op := range operatorSets[filterType] {
		if op == operator {
			return true
		}
	}
	if operator == "matches" && ftsUnionTypes[filterType] {
		return true
	}
	return false
}

type rawFilter struct {
	Type     string          `json:"type"`
	Column   *string         `json:"column"`
	Operator *string         `json:"operator"`
	Key      *string         `json:"key"`
	Value    json.RawMessage `json:"value"`
}

// jsonTypeName reports the JSON type of a raw value the way zod names it.
func jsonTypeName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "undefined"
	}
	switch raw[0] {
	case '"':
		return "string"
	case '{':
		return "object"
	case '[':
		return "array"
	case 't', 'f':
		return "boolean"
	case 'n':
		return "null"
	default:
		return "number"
	}
}

// ParseAdvancedFilters replicates optionalJsonParam(z.array(eventsTableSingleFilter)).
// JSON parse failures raise InvalidRequestError("Invalid JSON in filter
// parameter"); schema failures raise zod-parity validation issues.
func ParseAdvancedFilters(param string) ([]AdvancedFilter, error) {
	var anyValue any
	if err := json.Unmarshal([]byte(param), &anyValue); err != nil {
		return nil, apierror.NewInvalidRequestError("Invalid JSON in filter parameter")
	}

	var raws []rawFilter
	if err := json.Unmarshal([]byte(param), &raws); err != nil {
		return nil, &apierror.ValidationError{Issues: []apierror.ZodIssue{
			issueInvalidType("array", jsonTypeName(json.RawMessage(param)), "filter"),
		}}
	}

	issues := &issueCollector{}
	filters := make([]AdvancedFilter, 0, len(raws))

	for i, raw := range raws {
		f, ok := validateSingleFilter(raw, i, issues)
		if ok {
			filters = append(filters, f)
		}
	}

	if len(issues.issues) > 0 {
		return nil, &apierror.ValidationError{Issues: issues.issues}
	}
	return filters, nil
}

func validateSingleFilter(raw rawFilter, idx int, c *issueCollector) (AdvancedFilter, bool) {
	f := AdvancedFilter{Type: raw.Type}
	path := func(field string) []any { return []any{"filter", idx, field} }

	if _, known := operatorSets[raw.Type]; !known && raw.Type != "positionInTrace" {
		c.collect(issueNoDiscriminator(path("type")...))
		return f, false
	}
	if raw.Column == nil {
		c.collect(issueInvalidType("string", "undefined", path("column")...))
		return f, false
	}
	f.Column = *raw.Column

	if raw.Type == "positionInTrace" {
		return validatePositionInTrace(raw, f, path, c)
	}

	if raw.Operator == nil || !operatorAllowed(raw.Type, *raw.Operator) {
		if ftsUnionTypes[raw.Type] {
			c.collect(issueUnionOfLiterals(
				[][]string{operatorSets[raw.Type], {"matches"}}, path("operator")...))
		} else {
			c.collect(issueEnum(operatorSets[raw.Type], path("operator")...))
		}
		return f, false
	}
	f.Operator = *raw.Operator

	needsKey := raw.Type == "stringObject" || raw.Type == "numberObject" ||
		raw.Type == "booleanObject" || raw.Type == "categoryOptions"
	if needsKey {
		if raw.Key == nil {
			c.collect(issueInvalidType("string", "undefined", path("key")...))
			return f, false
		}
		f.Key = *raw.Key
	}

	switch raw.Type {
	case "datetime":
		// z.coerce.date(): new Date(value)
		var s string
		var n float64
		if err := json.Unmarshal(raw.Value, &s); err == nil {
			t, perr := parseJSDate(s)
			if perr != nil {
				c.collect(issueInvalidDate(path("value")...))
				return f, false
			}
			f.TimeValue = t
		} else if err := json.Unmarshal(raw.Value, &n); err == nil {
			f.TimeValue = time.UnixMilli(int64(n)).UTC()
		} else {
			c.collect(issueInvalidDate(path("value")...))
			return f, false
		}
	case "string", "stringObject":
		if err := json.Unmarshal(raw.Value, &f.StringValue); err != nil {
			c.collect(issueInvalidType("string", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
	case "number", "numberObject":
		if err := json.Unmarshal(raw.Value, &f.NumberValue); err != nil {
			c.collect(issueInvalidType("number", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
	case "boolean", "booleanObject":
		if err := json.Unmarshal(raw.Value, &f.BoolValue); err != nil {
			c.collect(issueInvalidType("boolean", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
	case "stringOptions":
		// z.array(z.string()).refine(v => v.length > 0) — both wrong types and
		// empty arrays surface as the refine's "Invalid input".
		if err := json.Unmarshal(raw.Value, &f.ArrayValue); err != nil {
			c.collect(issueInvalidType("array", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
		if len(f.ArrayValue) == 0 {
			c.collect(issueCustom("Invalid input", path("value")...))
			return f, false
		}
	case "arrayOptions", "categoryOptions":
		if err := json.Unmarshal(raw.Value, &f.ArrayValue); err != nil {
			c.collect(issueInvalidType("array", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
		if raw.Type == "arrayOptions" && f.Operator == "any of" && len(f.ArrayValue) == 0 {
			c.collect(issueCustom("Value array must not be empty unless operator is 'all of' or 'none of' (which represent waiting for selection)", "filter", idx))
			return f, false
		}
	case "null":
		var s string
		if err := json.Unmarshal(raw.Value, &s); err != nil || s != "" {
			c.collect(apierror.ZodIssue{
				"code": "invalid_value", "values": []any{""},
				"path": path("value"), "message": `Invalid input: expected ""`,
			})
			return f, false
		}
	}

	return f, true
}

func validatePositionInTrace(raw rawFilter, f AdvancedFilter, path func(string) []any, c *issueCollector) (AdvancedFilter, bool) {
	if raw.Operator == nil || *raw.Operator != "=" {
		c.collect(apierror.ZodIssue{
			"code": "invalid_value", "values": []any{"="},
			"path": path("operator"), "message": `Invalid input: expected "="`,
		})
		return f, false
	}
	f.Operator = "="
	if raw.Key == nil {
		c.collect(issueInvalidType("string", "undefined", path("key")...))
		return f, false
	}
	validKeys := []string{"root", "first", "last", "nthFromEnd", "nthFromStart"}
	if !inList(validKeys, *raw.Key) {
		c.collect(issueEnum(validKeys, path("key")...))
		return f, false
	}
	f.Key = *raw.Key
	if len(raw.Value) > 0 {
		if err := json.Unmarshal(raw.Value, &f.NumberValue); err != nil {
			c.collect(issueInvalidType("number", jsonTypeName(raw.Value), path("value")...))
			return f, false
		}
		f.HasValue = true
	}
	needsValue := f.Key == "nthFromEnd" || f.Key == "nthFromStart"
	if needsValue && (!f.HasValue || f.NumberValue < 1) {
		c.collect(issueCustom("Position must be >= 1 for nth selection", path("value")...))
		return f, false
	}
	return f, true
}
