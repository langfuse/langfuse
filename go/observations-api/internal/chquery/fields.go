// Package chquery builds the ClickHouse SQL for the v2 observations list,
// mirroring EventsQueryBuilder + buildObservationsQueryComponents
// (packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts,
// packages/shared/src/server/repositories/events.ts).
package chquery

import (
	"regexp"
	"strings"
)

// eventsFields ports EVENTS_FIELDS: field key -> SELECT expression.
// Only the keys reachable through the public v2 field groups are included.
var eventsFields = map[string]string{
	// Identity & basic fields
	"id":                  "e.span_id as id",
	"traceId":             `e.trace_id as "trace_id"`,
	"projectId":           `e.project_id as "project_id"`,
	"environment":         `e.environment as "environment"`,
	"type":                "e.type as type",
	"parentObservationId": `e.parent_span_id as "parent_observation_id"`,
	"name":                "e.name as name",
	"level":               "e.level as level",
	"statusMessage":       `e.status_message as "status_message"`,
	"version":             "e.version as version",
	"bookmarked":          "e.bookmarked as bookmarked",
	"public":              "e.public as public",
	"userId":              `e.user_id as "user_id"`,
	"sessionId":           `e.session_id as "session_id"`,
	"traceName":           `e.trace_name as "trace_name"`,

	// Time fields
	"startTime":           `e.start_time as "start_time"`,
	"endTime":             `e.end_time as "end_time"`,
	"completionStartTime": `e.completion_start_time as "completion_start_time"`,
	"createdAt":           `e.created_at as "created_at"`,
	"updatedAt":           `e.updated_at as "updated_at"`,

	// Model fields
	"providedModelName": `e.provided_model_name as "provided_model_name"`,
	"internalModelId":   `e.model_id as "internal_model_id"`,
	"modelParameters":   `e."model_parameters" as model_parameters`,

	// Usage & cost fields
	"usageDetails": `e.usage_details as "usage_details"`,
	"costDetails":  `e.cost_details as "cost_details"`,
	"totalCost":    `e.total_cost as "total_cost"`,

	// Prompt fields
	"promptId":      `e.prompt_id as "prompt_id"`,
	"promptName":    `e.prompt_name as "prompt_name"`,
	"promptVersion": `e.prompt_version as "prompt_version"`,

	// Pricing tier
	"usagePricingTierId":   `e.usage_pricing_tier_id as "usage_pricing_tier_id"`,
	"usagePricingTierName": `e.usage_pricing_tier_name as "usage_pricing_tier_name"`,

	// I/O & metadata fields
	"input":    "e.input",
	"output":   "e.output",
	"metadata": "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata",

	// Trace-level denormalized fields
	"tags":    "e.tags as tags",
	"release": "e.release as release",

	// Calculated fields
	"latency":          "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time)) as latency",
	"timeToFirstToken": "if(isNull(e.completion_start_time), NULL, date_diff('millisecond', e.start_time, e.completion_start_time)) as \"time_to_first_token\"",
}

// fieldSets ports the public API v2 entries of FIELD_SETS.
var fieldSets = map[string][]string{
	"core": {"id", "traceId", "startTime", "endTime", "projectId", "parentObservationId", "type"},
	"basic": {
		"name", "level", "statusMessage", "version", "environment",
		"bookmarked", "public", "userId", "sessionId",
	},
	"time":          {"completionStartTime", "createdAt", "updatedAt"},
	"io":            {"input", "output"},
	"metadata":      {"metadata"},
	"model":         {"providedModelName", "internalModelId", "modelParameters"},
	"usage":         {"usageDetails", "costDetails", "totalCost", "usagePricingTierId", "usagePricingTierName"},
	"prompt":        {"promptId", "promptName", "promptVersion"},
	"metrics":       {"latency", "timeToFirstToken"},
	"trace_context": {"tags", "release", "traceName"},
}

var aliasRe = regexp.MustCompile(`(?i)\bas\s+"?(\w+)"?\s*$`)

// extractAlias ports the Node helper: alias after AS, else text after the
// last dot ("e.input" -> "input").
func extractAlias(expr string) string {
	if m := aliasRe.FindStringSubmatch(expr); m != nil {
		return m[1]
	}
	if idx := strings.LastIndex(expr, "."); idx >= 0 {
		return expr[idx+1:]
	}
	return expr
}
