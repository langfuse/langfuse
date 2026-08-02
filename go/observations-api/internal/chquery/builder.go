package chquery

import (
	"fmt"
	"strings"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
	"github.com/langfuse/langfuse/go/observations-api/internal/query"
)

const eventsIOFilterTypeError = "Input/output filters only support filter type `string`."

// Query is the final ClickHouse query with server-side parameters and the
// projected column aliases (in SELECT order) for row decoding.
type Query struct {
	SQL     string
	Params  []Param
	Aliases []string
}

// Build assembles the v2 observations list query, porting
// getObservationsV2FromEventsTableForPublicApi.
func Build(p *query.Params, projectID string) (*Query, error) {
	ps := newParamSet()

	// validateInputOutputFilterTypes (raw advanced filters, before lowering)
	for _, f := range p.Filters {
		if m := findColumnMapping(f.Column); m != nil &&
			isFtsEventsTable(m.chTable) && isFtsTextField(m.chSelect) && f.Type != "string" {
			return nil, apierror.NewInvalidRequestError(eventsIOFilterTypeError)
		}
	}

	advanced, err := lowerAdvancedFilters(ps, p.Filters)
	if err != nil {
		return nil, err
	}
	simple := lowerSimpleFilters(ps, p)
	merged := mergeFilters(advanced, simple)

	// validateIndexedInputOutputFilters
	hasIOFilter := false
	hasIndexedIOFilter := false
	for _, f := range merged {
		if isFtsTextField(f.field) {
			hasIOFilter = true
			if f.operator == "=" || f.operator == "matches" {
				hasIndexedIOFilter = true
			}
		}
	}
	if hasIOFilter && !hasIndexedIOFilter {
		return nil, apierror.NewInvalidRequestError(
			"Input/output filters require at least one `matches` or `=` operator.")
	}

	// FTS text/metadata filters read columns that only exist untruncated on
	// events_full.
	filtersNeedFullTable := false
	for _, f := range merged {
		if strings.HasPrefix(f.chTable, "events") && (isFtsTextField(f.field) || isFtsMetadataField(f.field)) {
			filtersNeedFullTable = true
			break
		}
	}

	requested := p.Fields // nil => core only
	containsGroup := func(g string) bool {
		for _, r := range requested {
			if r == g {
				return true
			}
		}
		return false
	}

	needsIO := containsGroup("io")
	needsExpandedMetadata := containsGroup("metadata") && len(p.ExpandMetadata) > 0
	needsIOCTE := needsIO || needsExpandedMetadata
	metadataFromFullTable := needsIOCTE && containsGroup("metadata")

	// Field keys: core first, then requested groups (dedup, insertion order),
	// excluding io and (in CTE mode) metadata which come from events_full.
	seen := map[string]bool{}
	var fieldKeys []string
	addSet := func(group string) {
		for _, key := range fieldSets[group] {
			if !seen[key] {
				seen[key] = true
				fieldKeys = append(fieldKeys, key)
			}
		}
	}
	addSet("core")
	for _, g := range requested {
		if g == "core" || g == "io" {
			continue
		}
		if g == "metadata" && metadataFromFullTable {
			continue
		}
		addSet(g)
	}

	selectExprs := make([]string, 0, len(fieldKeys))
	aliases := make([]string, 0, len(fieldKeys))
	for _, key := range fieldKeys {
		expr := eventsFields[key]
		selectExprs = append(selectExprs, expr)
		aliases = append(aliases, extractAlias(expr))
	}

	// WHERE clauses in builder order: filters, then cursor. project_id is
	// prepended at build time (EventsQueryBuilder.buildQuery).
	var whereClauses []string
	if len(merged) > 0 {
		predicates := make([]string, len(merged))
		for i, f := range merged {
			predicates[i] = f.sql
		}
		whereClauses = append(whereClauses, "("+strings.Join(predicates, " AND ")+")")
	}
	if p.Cursor != nil {
		whereClauses = append(whereClauses,
			"e.start_time <= {lastStartTime: DateTime64(6)} AND (e.start_time, xxHash32(e.trace_id), e.span_id) < ({lastStartTime: DateTime64(6)}, xxHash32({lastTraceId: String}), {lastId: String})")
		ps.addNamed("lastStartTime", renderDateTime(p.Cursor.LastStartTimeTo))
		ps.addNamed("lastTraceId", p.Cursor.LastTraceID)
		ps.addNamed("lastId", p.Cursor.LastID)
	}
	whereClauses = append([]string{"e.project_id = {projectId: String}"}, whereClauses...)
	ps.addNamed("projectId", projectID)

	tableName := "events_core"
	if filtersNeedFullTable {
		tableName = "events_full"
	}

	ps.addNamed("rowLimit", jsNumberString(p.Limit+1))

	baseParts := []string{
		"SELECT\n  " + strings.Join(selectExprs, ",\n  "),
		"FROM " + tableName + " e",
		"WHERE " + strings.Join(whereClauses, "\n  AND "),
		"ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC, xxHash32(e.trace_id) DESC, e.span_id DESC",
		"LIMIT {rowLimit: Int32}",
	}
	baseSQL := strings.Join(baseParts, "\n")

	if !needsIOCTE {
		return &Query{SQL: baseSQL, Params: ps.params, Aliases: aliases}, nil
	}

	// CTE+JOIN split query (buildEventsFullTableSplitQuery)
	ioSelectParts := []string{
		"e.span_id as _io_id",
		`e.trace_id as "_io_trace_id"`,
		`e.start_time as "_io_start_time"`,
	}
	if needsIO {
		ioSelectParts = append(ioSelectParts, "e.input", "e.output")
	}
	if metadataFromFullTable {
		ioSelectParts = append(ioSelectParts,
			"mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata")
	}
	ioSQL := strings.Join([]string{
		"SELECT " + strings.Join(ioSelectParts, ", "),
		"FROM events_full e",
		"WHERE e.project_id = {projectId: String}",
		`AND (e.start_time, e.trace_id, e.span_id) IN (SELECT "start_time", "trace_id", id FROM base)`,
	}, "\n")

	outerSelect := make([]string, 0, len(aliases)+3)
	outerAliases := make([]string, 0, len(aliases)+3)
	for _, a := range aliases {
		outerSelect = append(outerSelect, fmt.Sprintf("b.%s as %s", a, a))
		outerAliases = append(outerAliases, a)
	}
	if needsIO {
		outerSelect = append(outerSelect, "i.input as input", "i.output as output")
		outerAliases = append(outerAliases, "input", "output")
	}
	if metadataFromFullTable {
		outerSelect = append(outerSelect, "i.metadata as metadata")
		outerAliases = append(outerAliases, "metadata")
	}

	finalSQL := strings.Join([]string{
		"WITH base AS (" + baseSQL + "),\nio AS (" + ioSQL + ")",
		"SELECT\n  " + strings.Join(outerSelect, ",\n  "),
		"FROM base b",
		`LEFT ANY JOIN io i ON b."start_time" = i."_io_start_time" AND b."trace_id" = i."_io_trace_id" AND b.id = i._io_id`,
		"ORDER BY b.start_time DESC, xxHash32(b.trace_id) DESC, b.id DESC",
	}, "\n")

	return &Query{SQL: finalSQL, Params: ps.params, Aliases: outerAliases}, nil
}
