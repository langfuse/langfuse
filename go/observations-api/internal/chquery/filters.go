package chquery

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
	"github.com/langfuse/langfuse/go/observations-api/internal/query"
)

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

// Param is a ClickHouse server-side query parameter ({name: Type} syntax).
// Value is pre-rendered to the textual form the server parses for Type.
type Param struct {
	Name  string
	Value string
}

type paramSet struct {
	params  []Param
	counter map[string]int
}

func newParamSet() *paramSet {
	return &paramSet{counter: map[string]int{}}
}

// add registers a value under a deterministic name derived from the prefix
// (Node uses random suffixes; determinism aids golden tests).
func (ps *paramSet) add(prefix, value string) string {
	ps.counter[prefix]++
	name := fmt.Sprintf("%s%d", prefix, ps.counter[prefix])
	ps.params = append(ps.params, Param{Name: name, Value: value})
	return name
}

// addNamed registers a value under a fixed name (projectId, limit, cursor params).
func (ps *paramSet) addNamed(name, value string) {
	for _, p := range ps.params {
		if p.Name == name {
			return
		}
	}
	ps.params = append(ps.params, Param{Name: name, Value: value})
}

// renderArrayString renders a Go slice as a ClickHouse Array(String) literal.
func renderArrayString(values []string) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, v := range values {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('\'')
		b.WriteString(strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(v))
		b.WriteByte('\'')
	}
	b.WriteByte(']')
	return b.String()
}

// renderDateTime renders a time for DateTime64 params:
// "YYYY-MM-DD HH:MM:SS.mmm" (convertDateToClickhouseDateTime parity).
func renderDateTime(t time.Time) string {
	return t.UTC().Truncate(time.Millisecond).Format("2006-01-02 15:04:05.000")
}

// jsNumberString formats a float like JS Number.prototype.toString().
func jsNumberString(v float64) string {
	if v == float64(int64(v)) && v < 1e21 && v > -1e21 {
		return strconv.FormatInt(int64(v), 10)
	}
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// ---------------------------------------------------------------------------
// Column mappings
// ---------------------------------------------------------------------------

// uiColumnMapping ports eventsTableNativeUiColumnDefinitions entries.
type uiColumnMapping struct {
	uiTableName     string
	uiTableID       string
	chTable         string
	chSelect        string
	typeOverwrite   string
	queryPrefix     string
	emptyEqualsNull bool
}

const eventsHasParentSQL = "e.parent_span_id != ''"
const eventsIsRootSQL = "(e.parent_span_id = '' OR e.is_app_root = true)"
const eventsHasInputSQL = "e.input != ''"
const eventsHasOutputSQL = "e.output != ''"

var nativeColumns = []uiColumnMapping{
	{uiTableName: "Environment", uiTableID: "environment", chTable: "events_proto", chSelect: `e."environment"`},
	{uiTableName: "Type", uiTableID: "type", chTable: "events_proto", chSelect: `e."type"`},
	{uiTableName: "ID", uiTableID: "id", chTable: "events_proto", chSelect: `e."span_id"`},
	{uiTableName: "Name", uiTableID: "name", chTable: "events_proto", chSelect: `e."name"`},
	{uiTableName: "Trace ID", uiTableID: "traceId", chTable: "events_proto", chSelect: `e."trace_id"`},
	{uiTableName: "Start Time", uiTableID: "startTime", chTable: "events_proto", chSelect: `e."start_time"`},
	{uiTableName: "End Time", uiTableID: "endTime", chTable: "events_proto", chSelect: `e."end_time"`},
	{uiTableName: "Time To First Token (s)", uiTableID: "timeToFirstToken", chTable: "events_proto",
		chSelect:      "if(isNull(e.completion_start_time), NULL,  date_diff('millisecond', e.start_time, e.completion_start_time) / 1000)",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Latency (s)", uiTableID: "latency", chTable: "events_proto",
		chSelect:      "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time) / 1000)",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Tokens per second", uiTableID: "tokensPerSecond", chTable: "events_proto",
		chSelect: "(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details))) / (date_diff('millisecond', start_time, end_time) / 1000))"},
	{uiTableName: "Input Cost ($)", uiTableID: "inputCost", chTable: "events_proto",
		chSelect: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))"},
	{uiTableName: "Output Cost ($)", uiTableID: "outputCost", chTable: "events_proto",
		chSelect: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))"},
	{uiTableName: "Total Cost ($)", uiTableID: "totalCost", chTable: "events_proto",
		chSelect: "if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)"},
	{uiTableName: "Level", uiTableID: "level", chTable: "events_proto", chSelect: `e."level"`},
	{uiTableName: "Status Message", uiTableID: "statusMessage", chTable: "events_proto", chSelect: `e."status_message"`},
	{uiTableName: "Model", uiTableID: "model", chTable: "events_proto", chSelect: `e."provided_model_name"`},
	{uiTableName: "Provided Model Name", uiTableID: "providedModelName", chTable: "events_proto", chSelect: `e."provided_model_name"`},
	{uiTableName: "Model ID", uiTableID: "modelId", chTable: "events_proto", chSelect: `e."model_id"`},
	{uiTableName: "Input Tokens", uiTableID: "inputTokens", chTable: "events_proto",
		chSelect:      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Output Tokens", uiTableID: "outputTokens", chTable: "events_proto",
		chSelect:      "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Total Tokens", uiTableID: "totalTokens", chTable: "events_proto",
		chSelect:      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Tokens", uiTableID: "tokens", chTable: "events_proto",
		chSelect:      "if(mapExists((k, v) -> (k = 'total'), usage_details), usage_details['total'], NULL)",
		typeOverwrite: "Decimal64(3)"},
	{uiTableName: "Metadata", uiTableID: "metadata", chTable: "events_proto", chSelect: "metadata", queryPrefix: "e"},
	{uiTableName: "Version", uiTableID: "version", chTable: "events_proto", chSelect: `e."version"`},
	{uiTableName: "Prompt Name", uiTableID: "promptName", chTable: "events_proto", chSelect: "e.prompt_name"},
	{uiTableName: "Prompt Version", uiTableID: "promptVersion", chTable: "events_proto", chSelect: "e.prompt_version"},
	{uiTableName: "Input", uiTableID: "input", chTable: "events_proto", chSelect: "e.input"},
	{uiTableName: "Output", uiTableID: "output", chTable: "events_proto", chSelect: "e.output"},
	{uiTableName: "Session ID", uiTableID: "sessionId", chTable: "events_proto", chSelect: `e."session_id"`},
	{uiTableName: "Trace Name", uiTableID: "traceName", chTable: "events_proto", chSelect: `e."trace_name"`},
	{uiTableName: "User ID", uiTableID: "userId", chTable: "events_proto", chSelect: `e."user_id"`},
	{uiTableName: "Trace Tags", uiTableID: "traceTags", chTable: "events_proto", chSelect: `e."tags"`},
	{uiTableName: "Tags", uiTableID: "tags", chTable: "events_proto", chSelect: `e."tags"`},
	{uiTableName: "Trace Environment", uiTableID: "traceEnvironment", chTable: "events_proto", chSelect: `e."environment"`},
	{uiTableName: "Has Parent Observation", uiTableID: "hasParentObservation", chTable: "events_proto", chSelect: eventsHasParentSQL},
	{uiTableName: "Is Root Observation", uiTableID: "isRootObservation", chTable: "events_proto", chSelect: eventsIsRootSQL},
	{uiTableName: "Has Input", uiTableID: "hasInput", chTable: "events_proto", chSelect: eventsHasInputSQL},
	{uiTableName: "Has Output", uiTableID: "hasOutput", chTable: "events_proto", chSelect: eventsHasOutputSQL},
	{uiTableName: "Parent Observation ID", uiTableID: "parentObservationId", chTable: "events_proto", chSelect: `e."parent_span_id"`, emptyEqualsNull: true},
	{uiTableName: "Experiment Dataset ID", uiTableID: "experimentDatasetId", chTable: "events_proto", chSelect: `e."experiment_dataset_id"`},
	{uiTableName: "Experiment ID", uiTableID: "experimentId", chTable: "events_proto", chSelect: `e."experiment_id"`},
	{uiTableName: "Experiment Name", uiTableID: "experimentName", chTable: "events_proto", chSelect: `e."experiment_name"`},
	{uiTableName: "Is Experiment Item Root Span", uiTableID: "isExperimentItemRootSpan", chTable: "events_proto", chSelect: "e.experiment_item_root_span_id = e.span_id"},
	{uiTableName: "Available Tools", uiTableID: "toolDefinitions", chTable: "events_proto", chSelect: "length(mapKeys(e.tool_definitions))"},
	{uiTableName: "Tool Calls", uiTableID: "toolCalls", chTable: "events_proto", chSelect: "length(e.tool_calls)"},
	{uiTableName: "Tool Names", uiTableID: "toolNames", chTable: "events_proto", chSelect: "mapKeys(e.tool_definitions)"},
	{uiTableName: "Called Tool Names", uiTableID: "calledToolNames", chTable: "events_proto", chSelect: "e.tool_call_names"},
}

// eventsTableColTypes ports eventsTableCols: uiTableId -> column filter type,
// used for COMPATIBLE_FILTER_TYPES validation.
var eventsTableColTypes = map[string]string{
	"id": "stringOptions", "traceId": "string", "startTime": "datetime", "endTime": "datetime",
	"name": "stringOptions", "type": "stringOptions", "environment": "stringOptions",
	"version": "string", "userId": "string", "sessionId": "string", "traceName": "stringOptions",
	"level": "stringOptions", "statusMessage": "string", "promptName": "stringOptions",
	"promptVersion": "number", "modelId": "stringOptions", "providedModelName": "stringOptions",
	"totalCost": "number", "inputTokens": "number", "outputTokens": "number", "totalTokens": "number",
	"inputCost": "number", "outputCost": "number", "latency": "number", "timeToFirstToken": "number",
	"tokensPerSecond": "number", "input": "string", "output": "string", "metadata": "stringObject",
	"traceTags": "arrayOptions", "scores_avg": "numberObject", "score_categories": "categoryOptions",
	"score_booleans": "booleanObject", "trace_scores_avg": "numberObject",
	"trace_score_categories": "categoryOptions", "trace_score_booleans": "booleanObject",
	"commentCount": "number", "commentContent": "string",
	"hasParentObservation": "boolean", "isRootObservation": "boolean",
	"hasInput": "boolean", "hasOutput": "boolean",
	"experimentDatasetId": "stringOptions", "experimentId": "stringOptions", "experimentName": "stringOptions",
	"toolNames": "arrayOptions", "calledToolNames": "arrayOptions",
	"toolDefinitions": "number", "toolCalls": "number", "isExperimentItemRootSpan": "boolean",
}

// compatibleFilterTypes ports COMPATIBLE_FILTER_TYPES.
var compatibleFilterTypes = map[string][]string{
	"string":          {"string", "stringOptions"},
	"stringOptions":   {"string", "stringOptions"},
	"arrayOptions":    {"arrayOptions", "stringOptions"},
	"datetime":        {"datetime"},
	"number":          {"number"},
	"boolean":         {"boolean"},
	"stringObject":    {"stringObject"},
	"numberObject":    {"numberObject"},
	"booleanObject":   {"booleanObject"},
	"categoryOptions": {"categoryOptions", "stringOptions"},
}

func findColumnMapping(column string) *uiColumnMapping {
	for i := range nativeColumns {
		if nativeColumns[i].uiTableID == column || nativeColumns[i].uiTableName == column {
			return &nativeColumns[i]
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// FTS helpers (fts.ts parity)
// ---------------------------------------------------------------------------

const (
	ftsMatchTokenError  = "`matches` requires at least one search token."
	ftsMatchTargetError = "`matches` is only supported for input, output, and metadata filters."
	ftsMaxSearchTokens  = 64
)

func bareFtsField(field string) string {
	if idx := strings.LastIndex(field, "."); idx >= 0 {
		field = field[idx+1:]
	}
	return strings.TrimSuffix(strings.TrimPrefix(field, `"`), `"`)
}

func isFtsEventsTable(table string) bool {
	return table == "events_proto" || table == "events_core" || table == "events_full"
}

func isFtsTextField(field string) bool {
	bare := bareFtsField(field)
	return bare == "input" || bare == "output"
}

func isFtsMetadataField(field string) bool {
	return bareFtsField(field) == "metadata"
}

func hasFtsSearchToken(value string) bool {
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			return true
		}
	}
	return false
}

func ftsSearchTokensExpr(valueParam string, normalize bool) string {
	inner := valueParam
	if normalize {
		inner = "lower(" + valueParam + ")"
	}
	return "arrayDistinct(tokens(" + inner + "))"
}

func ftsTokenPrefilter(fieldExpr, valueParam string, normalizeValue bool) string {
	return fmt.Sprintf("hasAllTokens(%s, arraySlice(%s, 1, %d))",
		fieldExpr, ftsSearchTokensExpr(valueParam, normalizeValue), ftsMaxSearchTokens)
}

// ftsTextEqualsCondition: FTS_OPERATOR_DESCRIPTORS["="].textCondition
func ftsTextEqualsCondition(fieldExpr, valueParam, exactCondition string) string {
	tokenPredicate := ftsTokenPrefilter("lower("+fieldExpr+")", valueParam, true)
	return fmt.Sprintf("(%s AND (empty(%s) OR %s))",
		exactCondition, ftsSearchTokensExpr(valueParam, true), tokenPredicate)
}

// ftsTextMatchesCondition: FTS_OPERATOR_DESCRIPTORS["matches"].textCondition
func ftsTextMatchesCondition(fieldExpr, valueParam string) string {
	return fmt.Sprintf("(position(lower(%s), lower(%s)) > 0 AND %s)",
		fieldExpr, valueParam, ftsTokenPrefilter("lower("+fieldExpr+")", valueParam, true))
}

func escapeSQLLikePattern(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

// ---------------------------------------------------------------------------
// Lowered filters
// ---------------------------------------------------------------------------

// loweredFilter is one compiled predicate (a Filter instance in Node terms).
type loweredFilter struct {
	chTable  string
	field    string // clickhouseSelect (before prefixing)
	operator string
	sql      string
	// simple marks filters derived from simple query params (for the
	// deriveFilters merge semantics).
	simple bool
}

func fieldWithPrefix(prefix, field string) string {
	if prefix != "" {
		return prefix + "." + field
	}
	return field
}

// lowerStringFilter ports StringFilter.apply().
func lowerStringFilter(ps *paramSet, chTable, field, operator, value, prefix string, emptyEqualsNull bool) (string, error) {
	fw := fieldWithPrefix(prefix, field)

	if emptyEqualsNull && value == "" {
		switch operator {
		case "=", "contains", "starts with", "ends with":
			return fmt.Sprintf("(%s = '' OR %s IS NULL)", fw, fw), nil
		}
	}

	name := ps.add("stringFilter", value)
	param := fmt.Sprintf("{%s: String}", name)

	var sql string
	switch operator {
	case "=":
		sql = fmt.Sprintf("%s = %s", fw, param)
		if isFtsEventsTable(chTable) && isFtsTextField(field) {
			sql = ftsTextEqualsCondition(fw, param, sql)
		}
	case "contains":
		sql = fmt.Sprintf("position(%s, %s) > 0", fw, param)
	case "does not contain":
		sql = fmt.Sprintf("position(%s, %s) = 0", fw, param)
	case "starts with":
		sql = fmt.Sprintf("startsWith(%s, %s)", fw, param)
	case "ends with":
		sql = fmt.Sprintf("endsWith(%s, %s)", fw, param)
	case "matches":
		if !hasFtsSearchToken(value) {
			return "", apierror.NewInvalidRequestError(ftsMatchTokenError)
		}
		if !(isFtsEventsTable(chTable) && isFtsTextField(field)) {
			return "", apierror.NewInvalidRequestError(ftsMatchTargetError)
		}
		sql = ftsTextMatchesCondition(fw, param)
	default:
		return "", fmt.Errorf("unsupported operator: %s", operator)
	}

	if emptyEqualsNull && operator == "does not contain" {
		sql = fmt.Sprintf("(%s != '' AND %s)", fw, sql)
	}
	return sql, nil
}

// lowerStringObjectFilter ports StringObjectFilter.apply() for events tables.
func lowerStringObjectFilter(ps *paramSet, chTable, field, operator, key, value, prefix string) (string, error) {
	if !isFtsEventsTable(chTable) {
		return "", fmt.Errorf("stringObject filters on non-events tables are not supported by this service")
	}

	keyName := ps.add("stringObjectKeyFilter", key)
	valueName := ps.add("stringObjectValueFilter", value)

	pfx := ""
	if prefix != "" {
		pfx = prefix + "."
	}
	namesColumn := pfx + field + "_names"
	valuesColumn := pfx + field + "_values"
	keyParam := fmt.Sprintf("{%s: String}", keyName)
	valueParam := fmt.Sprintf("{%s: String}", valueName)
	valueAccessor := fmt.Sprintf("%s[indexOf(%s, %s)]", valuesColumn, namesColumn, keyParam)
	hasKey := fmt.Sprintf("has(%s, %s)", namesColumn, keyParam)

	ngramOperators := map[string]bool{"contains": true, "starts with": true, "ends with": true}
	ngramConjunct := ""
	if operator != "matches" && isFtsMetadataField(field) && ngramOperators[operator] && len(value) > 0 {
		ngramName := ps.add("stringObjectNgramFilter", "%"+escapeSQLLikePattern(value)+"%")
		ngramConjunct = fmt.Sprintf(" AND like(arrayStringConcat(%s), {%s: String})", valuesColumn, ngramName)
	}

	switch operator {
	case "=":
		return fmt.Sprintf("%s AND has(%s, %s) AND (%s = %s)", hasKey, valuesColumn, valueParam, valueAccessor, valueParam), nil
	case "contains":
		return fmt.Sprintf("%s%s AND (position(%s, %s) > 0)", hasKey, ngramConjunct, valueAccessor, valueParam), nil
	case "does not contain":
		return fmt.Sprintf("%s AND (position(%s, %s) = 0)", hasKey, valueAccessor, valueParam), nil
	case "starts with":
		return fmt.Sprintf("%s%s AND (startsWith(%s, %s))", hasKey, ngramConjunct, valueAccessor, valueParam), nil
	case "ends with":
		return fmt.Sprintf("%s%s AND (endsWith(%s, %s))", hasKey, ngramConjunct, valueAccessor, valueParam), nil
	case "matches":
		if !hasFtsSearchToken(value) {
			return "", apierror.NewInvalidRequestError(ftsMatchTokenError)
		}
		if !isFtsMetadataField(field) {
			return "", apierror.NewInvalidRequestError(ftsMatchTargetError)
		}
		return fmt.Sprintf("%s AND %s AND (position(%s, %s) > 0)",
			hasKey, ftsTokenPrefilter(valuesColumn, valueParam, false), valueAccessor, valueParam), nil
	default:
		return "", fmt.Errorf("unsupported operator: %s", operator)
	}
}

// lowerAdvancedFilters ports createFilterFromFilterState with the native
// events column mapping and eventsTableCols type-compat validation.
func lowerAdvancedFilters(ps *paramSet, filters []query.AdvancedFilter) ([]loweredFilter, error) {
	lowered := make([]loweredFilter, 0, len(filters))

	for _, f := range filters {
		if f.Type == "positionInTrace" {
			continue // filtered out before lowering (factory.ts)
		}

		column := f.Column
		// Legacy "scores" column resolution
		if strings.EqualFold(column, "scores") {
			legacy := map[string]string{
				"categoryOptions": "score_categories",
				"numberObject":    "scores_avg",
				"booleanObject":   "score_booleans",
			}
			typed, ok := legacy[f.Type]
			if !ok {
				return nil, apierror.NewInvalidRequestError(fmt.Sprintf(
					"Invalid filter type '%s' for legacy score column '%s'. Expected one of 'categoryOptions', 'numberObject', or 'booleanObject'.",
					f.Type, f.Column))
			}
			if f.Type == "numberObject" && findColumnMapping(typed) == nil {
				// keep original column; fails the mapping lookup below
			} else {
				column = typed
			}
		}

		mapping := findColumnMapping(column)
		if mapping == nil {
			return nil, apierror.NewInvalidRequestError(fmt.Sprintf(
				"Column %s does not match a UI / CH table mapping.", column))
		}

		// Filter type compatibility (COMPATIBLE_FILTER_TYPES)
		if f.Type != "null" {
			if colType, ok := eventsTableColTypes[mapping.uiTableID]; ok {
				if compatible, hasCompat := compatibleFilterTypes[colType]; hasCompat {
					found := false
					for _, t := range compatible {
						if t == f.Type {
							found = true
							break
						}
					}
					if !found {
						return nil, apierror.NewInvalidRequestError(fmt.Sprintf(
							"Invalid filter type '%s' for column '%s'. Expected filter type '%s'.",
							f.Type, f.Column, colType))
					}
				}
			}
		}

		// validateEventsTableMatchesFilter (factory.ts)
		if f.Operator == "matches" {
			if !hasFtsSearchToken(f.StringValue) {
				return nil, apierror.NewInvalidRequestError(ftsMatchTokenError)
			}
			isValidTarget := (f.Type == "string" && isFtsEventsTable(mapping.chTable) && isFtsTextField(mapping.chSelect)) ||
				(f.Type == "stringObject" && isFtsEventsTable(mapping.chTable) && isFtsMetadataField(mapping.chSelect))
			if !isValidTarget {
				return nil, apierror.NewInvalidRequestError(ftsMatchTargetError)
			}
		}

		lf := loweredFilter{chTable: mapping.chTable, field: mapping.chSelect, operator: f.Operator}
		var err error

		switch f.Type {
		case "string":
			lf.sql, err = lowerStringFilter(ps, mapping.chTable, mapping.chSelect, f.Operator, f.StringValue, mapping.queryPrefix, mapping.emptyEqualsNull)
		case "datetime":
			name := ps.add("dateTimeFilter", renderDateTime(f.TimeValue))
			lf.sql = fmt.Sprintf("%s %s {%s: DateTime64(3)}", fieldWithPrefix(mapping.queryPrefix, mapping.chSelect), f.Operator, name)
		case "stringOptions":
			name := ps.add("stringOptionsFilter", renderArrayString(f.ArrayValue))
			fw := fieldWithPrefix(mapping.queryPrefix, mapping.chSelect)
			op := "IN"
			if f.Operator == "none of" {
				op = "NOT IN"
			}
			lf.sql = fmt.Sprintf("%s %s ({%s: Array(String)})", fw, op, name)
			// emptyEqualsNull adjustments (StringOptionsFilter.apply)
			hasEmpty := mapping.emptyEqualsNull && contains(f.ArrayValue, "")
			if hasEmpty && f.Operator == "any of" {
				lf.sql = fmt.Sprintf("(%s OR %s IS NULL)", lf.sql, fw)
			} else if mapping.emptyEqualsNull && f.Operator == "none of" {
				guard := fw + " != ''"
				if hasEmpty {
					guard = fw + " IS NOT NULL"
				}
				lf.sql = fmt.Sprintf("(%s AND %s)", lf.sql, guard)
			}
		case "categoryOptions":
			flattened := make([]string, 0, len(f.ArrayValue))
			for _, child := range f.ArrayValue {
				flattened = append(flattened, f.Key+":"+child)
			}
			name := ps.add("categoryOptionsFilter", renderArrayString(flattened))
			fw := fieldWithPrefix(mapping.queryPrefix, mapping.chSelect)
			if f.Operator == "none of" {
				lf.sql = fmt.Sprintf("NOT hasAny(%s, {%s: Array(String)})", fw, name)
			} else {
				lf.sql = fmt.Sprintf("hasAny(%s, {%s: Array(String)})", fw, name)
			}
		case "number":
			chType := mapping.typeOverwrite
			if chType == "" {
				chType = "Decimal64(12)"
			}
			name := ps.add("numberFilter", jsNumberString(f.NumberValue))
			lf.sql = fmt.Sprintf("%s %s {%s: %s}", fieldWithPrefix(mapping.queryPrefix, mapping.chSelect), f.Operator, name, chType)
		case "arrayOptions":
			name := ps.add("arrayOptionsFilter", renderArrayString(f.ArrayValue))
			fw := fieldWithPrefix(mapping.queryPrefix, mapping.chSelect)
			switch f.Operator {
			case "any of":
				lf.sql = fmt.Sprintf("hasAny({%s: Array(String)}, %s) = True", name, fw)
			case "none of":
				lf.sql = fmt.Sprintf("hasAny({%s: Array(String)}, %s) = False", name, fw)
			case "all of":
				lf.sql = fmt.Sprintf("hasAll(%s, {%s: Array(String)}) = True", fw, name)
			}
		case "boolean":
			name := ps.add("booleanFilter", boolString(f.BoolValue))
			lf.sql = fmt.Sprintf("%s %s {%s: Boolean}", fieldWithPrefix(mapping.queryPrefix, mapping.chSelect), f.Operator, name)
		case "numberObject":
			keyName := ps.add("numberObjectKeyFilter", f.Key)
			valueName := ps.add("numberObjectValueFilter", jsNumberString(f.NumberValue))
			column := fieldWithPrefix(mapping.queryPrefix, mapping.chSelect)
			lf.sql = fmt.Sprintf("empty(arrayFilter(x -> (((x.1) = {%s: String}) AND ((x.2) %s {%s: Decimal64(12)})), %s)) = 0",
				keyName, f.Operator, valueName, column)
		case "booleanObject":
			name := ps.add("booleanObjectFilter", f.Key+":"+boolString(f.BoolValue))
			predicate := fmt.Sprintf("has(%s, {%s: String})", fieldWithPrefix(mapping.queryPrefix, mapping.chSelect), name)
			if f.Operator == "<>" {
				predicate = "NOT " + predicate
			}
			lf.sql = predicate
		case "stringObject":
			lf.sql, err = lowerStringObjectFilter(ps, mapping.chTable, mapping.chSelect, f.Operator, f.Key, f.StringValue, mapping.queryPrefix)
		case "null":
			fw := fieldWithPrefix(mapping.queryPrefix, mapping.chSelect)
			if mapping.emptyEqualsNull {
				if f.Operator == "is null" {
					lf.sql = fmt.Sprintf("(%s = '' OR %s IS NULL)", fw, fw)
				} else {
					lf.sql = fmt.Sprintf("(%s != '' AND %s IS NOT NULL)", fw, fw)
				}
			} else {
				lf.sql = fmt.Sprintf("%s %s", fw, f.Operator)
			}
		default:
			return nil, apierror.NewInvalidRequestError("Invalid filter type")
		}

		if err != nil {
			return nil, err
		}
		lowered = append(lowered, lf)
	}

	return lowered, nil
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func contains(values []string, v string) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}

// simpleFilterSpec ports createPublicApiObservationsColumnMapping("events_proto", "e", "parent_span_id").
type simpleFilterSpec struct {
	field    string
	kind     string // StringFilter | StringOptionsFilter | DateTimeFilter
	operator string // fixed operator for DateTimeFilter entries
}

var simpleFilterSpecs = []struct {
	id   string
	spec simpleFilterSpec
}{
	{"userId", simpleFilterSpec{field: "user_id", kind: "StringFilter"}},
	{"traceId", simpleFilterSpec{field: "trace_id", kind: "StringFilter"}},
	{"name", simpleFilterSpec{field: "name", kind: "StringFilter"}},
	{"level", simpleFilterSpec{field: "level", kind: "StringFilter"}},
	{"type", simpleFilterSpec{field: "type", kind: "StringFilter"}},
	{"parentObservationId", simpleFilterSpec{field: "parent_span_id", kind: "StringFilter"}},
	{"fromStartTime", simpleFilterSpec{field: "start_time", kind: "DateTimeFilter", operator: ">="}},
	{"toStartTime", simpleFilterSpec{field: "start_time", kind: "DateTimeFilter", operator: "<"}},
	{"version", simpleFilterSpec{field: "version", kind: "StringFilter"}},
	{"environment", simpleFilterSpec{field: "environment", kind: "StringOptionsFilter"}},
}

// lowerSimpleFilters ports convertApiProvidedFilterToClickhouseFilter for the
// v2 observations query params.
func lowerSimpleFilters(ps *paramSet, p *query.Params) []loweredFilter {
	stringValues := map[string]*string{
		"userId": p.UserID, "traceId": p.TraceID, "name": p.Name, "level": p.Level,
		"type": p.Type, "parentObservationId": p.ParentObservationID, "version": p.Version,
	}
	timeValues := map[string]*time.Time{
		"fromStartTime": p.FromStartTime, "toStartTime": p.ToStartTime,
	}

	var lowered []loweredFilter
	for _, entry := range simpleFilterSpecs {
		spec := entry.spec
		switch spec.kind {
		case "StringFilter":
			v := stringValues[entry.id]
			if v == nil {
				continue
			}
			sql, _ := lowerStringFilter(ps, "events_proto", spec.field, "=", *v, "e", false)
			lowered = append(lowered, loweredFilter{chTable: "events_proto", field: spec.field, operator: "=", sql: sql, simple: true})
		case "DateTimeFilter":
			v := timeValues[entry.id]
			if v == nil {
				continue
			}
			name := ps.add("dateTimeFilter", renderDateTime(*v))
			sql := fmt.Sprintf("e.%s %s {%s: DateTime64(3)}", spec.field, spec.operator, name)
			lowered = append(lowered, loweredFilter{chTable: "events_proto", field: spec.field, operator: spec.operator, sql: sql, simple: true})
		case "StringOptionsFilter":
			if entry.id == "environment" && p.Environment != nil {
				values := p.Environment
				if len(values) == 1 {
					values = strings.Split(values[0], ",")
				}
				name := ps.add("stringOptionsFilter", renderArrayString(values))
				sql := fmt.Sprintf("e.environment IN ({%s: Array(String)})", name)
				lowered = append(lowered, loweredFilter{chTable: "events_proto", field: "environment", operator: "any of", sql: sql, simple: true})
			}
		}
	}
	return lowered
}

// mergeFilters ports deriveFilters: advanced filters first, then simple
// filters whose field is not already targeted by an advanced filter.
func mergeFilters(advanced, simple []loweredFilter) []loweredFilter {
	advancedFields := map[string]bool{}
	for _, f := range advanced {
		advancedFields[f.field] = true
	}
	merged := advanced
	for _, f := range simple {
		if !advancedFields[f.field] {
			merged = append(merged, f)
		}
	}
	return merged
}
