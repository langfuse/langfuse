import { InvalidRequestError, singleFilterList } from "@langfuse/shared";
import { z } from "zod";

import { defineTool } from "@/src/features/mcp/core/define-tool";
import { McpAdvancedFilterBaseSchema } from "@/src/features/mcp/core/filter-schema";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import {
  GetUnstableTopicAssignmentsQuery,
  GetUnstableTopicFacetsQuery,
  GetUnstableTopicRulesQuery,
  GetUnstableTopicsQuery,
  GetUnstableTopicSummariesQuery,
} from "@/src/features/public-api/types/unstable-topics";
import { StructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import {
  listPublicTopicAssignments,
  listPublicTopicFacets,
  listPublicTopicRules,
  listPublicTopics,
  listPublicTopicSummaries,
} from "@/src/features/topics/server/publicApi";

const MCP_TOPIC_RESULTS_MAX_LIMIT = 100;

const windowBaseFields = {
  fromTimestamp: z
    .string()
    .optional()
    .describe(
      "ISO 8601 start of the window (trace start time, inclusive). Defaults to 7 days before toTimestamp.",
    ),
  toTimestamp: z
    .string()
    .optional()
    .describe(
      "ISO 8601 end of the window (trace start time, exclusive). Defaults to now.",
    ),
};

const filterInput = { filter: singleFilterList.optional() };

/** Agents recover from bad filters faster when the allowed values are in the message. */
async function withAllowedValues<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const allowed =
      error instanceof StructuredPublicApiError && error.httpCode === 400
        ? (error.details?.allowedValues ?? [])
        : [];
    if (allowed.length > 0)
      throw new InvalidRequestError(
        `${(error as Error).message} Allowed: ${allowed.join(", ")}.`,
      );
    throw error;
  }
}

export const [listTopicFacetsTool, handleListTopicFacets] = defineTool({
  name: "listTopicFacets",
  description:
    "List the project's Topics facets (the dimensions traces are clustered by, such as issues or intents) with their published topic map. Only active facets are returned unless the filter has an `active` condition.",
  action: "topics:read",
  baseSchema: z.object({
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        "Filter conditions combined with AND. Columns: id (stringOptions), name (string, stringOptions), description (string), isBuiltIn (boolean), active (boolean).",
      ),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
  inputSchema: GetUnstableTopicFacetsQuery.extend(filterInput),
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.topics.list_facets",
      context,
      fn: () =>
        withAllowedValues(() =>
          listPublicTopicFacets({ projectId: context.projectId, ...input }),
        ),
    }),
  readOnlyHint: true,
});

export const [listTopicsTool, handleListTopics] = defineTool({
  name: "listTopics",
  description:
    "List the topics of each active facet's current map with the number of traces assigned to each topic in the window, plus per-facet trace counts by topic status. The window spans at most 93 days.",
  action: "topics:read",
  baseSchema: z.object({
    ...windowBaseFields,
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        "Filter conditions combined with AND. Columns: facetId (stringOptions), facetName (string, stringOptions), id (stringOptions), name (string, stringOptions).",
      ),
    orderBy: z
      .enum(["traceCount.desc", "traceCount.asc", "name.asc", "name.desc"])
      .optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
  inputSchema: GetUnstableTopicsQuery.extend(filterInput),
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.topics.list",
      context,
      fn: () =>
        withAllowedValues(() =>
          listPublicTopics({ projectId: context.projectId, ...input }),
        ),
    }),
  readOnlyHint: true,
});

export const [listTopicRulesTool, handleListTopicRules] = defineTool({
  name: "listTopicRules",
  description:
    "List the project's Topics rules. A rule selects traces with an observation filter and sampling rate, runs the facets in facetIds and keeps its own live topic map.",
  action: "topics:read",
  baseSchema: z.object({
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        "Filter conditions combined with AND. Columns: id (stringOptions), name (string, stringOptions).",
      ),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
  inputSchema: GetUnstableTopicRulesQuery.extend(filterInput),
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.topics.list_rules",
      context,
      fn: () =>
        withAllowedValues(() =>
          listPublicTopicRules({ projectId: context.projectId, ...input }),
        ),
    }),
  readOnlyHint: true,
});

const resultListBaseFields = {
  ...windowBaseFields,
  orderBy: z.enum(["timestamp.desc", "timestamp.asc"]).optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(MCP_TOPIC_RESULTS_MAX_LIMIT)
    .optional()
    .describe(
      `Rows per page. Defaults to 20, at most ${MCP_TOPIC_RESULTS_MAX_LIMIT}.`,
    ),
  cursor: z.string().optional().describe("meta.cursor of the previous page."),
};

const resultListInput = {
  ...filterInput,
  limit: z
    .number()
    .int()
    .positive()
    .max(MCP_TOPIC_RESULTS_MAX_LIMIT)
    .default(20),
};

const TRACE_ID_HINT =
  "For specific traces (such as the trace the user is viewing) filter traceId with `any of`; without a window, that lookup covers the traces' own start time within the last 93 days.";

export const [listTopicSummariesTool, handleListTopicSummaries] = defineTool({
  name: "listTopicSummaries",
  description: [
    "List the current Topics summary of traces, one row per trace and facet: what the trace is about from that facet's perspective.",
    TRACE_ID_HINT,
    "Filter by topicId, topicName or assignmentStatus to read the summaries of a topic's traces, or of traces no topic fits (outlier) or not yet assigned (awaiting_map).",
    "The window spans at most 30 days. Use meta.cursor to fetch the next page; a short or empty page with a cursor is not the end. traceId accepts at most 100 ids.",
  ].join(" "),
  action: "topics:read",
  baseSchema: z.object({
    ...resultListBaseFields,
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        'Filter conditions combined with AND. Columns: traceId, facetId, facetName, ruleId, environment (stringOptions), timestamp, processedAt (datetime), state (stringOptions: complete, not_applicable, insufficient_input), topicId, topicName (stringOptions), assignmentStatus (stringOptions, any of: assigned, outlier, awaiting_map). Example: [{"type":"stringOptions","column":"traceId","operator":"any of","value":["<trace id>"]}].',
      ),
    truncateSummaries: z
      .boolean()
      .optional()
      .describe("Truncate summaries to 500 characters. Defaults to true."),
  }),
  inputSchema: GetUnstableTopicSummariesQuery.extend({
    ...resultListInput,
    truncateSummaries: z.boolean().default(true),
  }),
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.topics.list_summaries",
      context,
      attributes: { "mcp.pagination_limit": input.limit },
      fn: async (span) => {
        const result = await withAllowedValues(() =>
          listPublicTopicSummaries({
            projectId: context.projectId,
            plan: context.plan,
            ...input,
          }),
        );
        span.setAttribute("mcp.result_count", result.data.length);
        return result;
      },
    }),
  readOnlyHint: true,
});

export const [listTopicAssignmentsTool, handleListTopicAssignments] =
  defineTool({
    name: "listTopicAssignments",
    description: [
      "List the current topic of traces on each rule's live map, one row per trace, facet and rule. status is assigned (with its topic) or outlier (no topic fits).",
      TRACE_ID_HINT,
      "Filter by topicId or topicName to list a topic's traces.",
      "The window spans at most 30 days. Use meta.cursor to fetch the next page; a short or empty page with a cursor is not the end. traceId accepts at most 100 ids.",
    ].join(" "),
    action: "topics:read",
    baseSchema: z.object({
      ...resultListBaseFields,
      filter: z
        .array(McpAdvancedFilterBaseSchema)
        .optional()
        .describe(
          "Filter conditions combined with AND. Columns: traceId, facetId, facetName, ruleId, environment, topicId, topicName (stringOptions), status (stringOptions, any of: assigned, outlier), timestamp (datetime).",
        ),
    }),
    inputSchema: GetUnstableTopicAssignmentsQuery.extend(resultListInput),
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.topics.list_assignments",
        context,
        attributes: { "mcp.pagination_limit": input.limit },
        fn: async (span) => {
          const result = await withAllowedValues(() =>
            listPublicTopicAssignments({
              projectId: context.projectId,
              plan: context.plan,
              ...input,
            }),
          );
          span.setAttribute("mcp.result_count", result.data.length);
          return result;
        },
      }),
    readOnlyHint: true,
  });
