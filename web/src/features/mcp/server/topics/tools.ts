import { InvalidRequestError, singleFilterList } from "@langfuse/shared";
import { z } from "zod";

import { defineTool } from "@/src/features/mcp/core/define-tool";
import { McpAdvancedFilterBaseSchema } from "@/src/features/mcp/core/filter-schema";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import {
  GetUnstableTopicFacetsQuery,
  GetUnstableTopicsQuery,
  GetUnstableTopicTracesQuery,
} from "@/src/features/public-api/types/unstable-topics";
import { StructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import {
  listPublicTopicFacets,
  listPublicTopics,
  listPublicTopicTraces,
} from "@/src/features/topics/server/publicApi";

const MCP_TOPIC_TRACES_MAX_LIMIT = 100;

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
      "ISO 8601 end of the window (trace start time, exclusive). Defaults to now. The window spans at most 93 days.",
    ),
};

const filterInput = { filter: singleFilterList.optional() };

/** Agents recover from bad filters faster when the allowed values are in the message. */
async function withAllowedValues<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof StructuredPublicApiError &&
      error.httpCode === 400 &&
      error.details?.allowedValues?.length
    )
      throw new InvalidRequestError(
        `${error.message} Allowed: ${error.details.allowedValues.join(", ")}.`,
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
    "List the topics of each active facet's current map with the number of traces assigned to each topic in the window, plus per-facet trace counts by topic status.",
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

export const [getTopicsForTracesTool, handleGetTopicsForTraces] = defineTool({
  name: "getTopicsForTraces",
  description: [
    "Get the current Topics result of traces, one row per trace with a result per facet: state, summary and assigned topic.",
    "For specific traces (such as the trace the user is viewing) filter traceId with `any of`.",
    "topicStatus values: assigned (in a topic of the current map), outlier (summarized, no topic fits), awaiting_map (summarized, not yet assigned), not_applicable, insufficient_input.",
    "Use meta.cursor to fetch the next page.",
  ].join(" "),
  action: "topics:read",
  baseSchema: z.object({
    ...windowBaseFields,
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        'Filter conditions combined with AND. Columns: traceId (stringOptions), traceName (string, stringOptions), environment (stringOptions), sessionId (string, stringOptions), userId (stringOptions, exact), timestamp (datetime), processedAt (datetime), topicId (stringOptions), topicName (stringOptions, or categoryOptions with key = facet), topicStatus (categoryOptions, key = facet id or name), summary (stringObject, key = facet), facetVersion (numberObject, key = facet). Example: [{"type":"stringOptions","column":"traceId","operator":"any of","value":["<trace id>"]}].',
      ),
    facets: z
      .array(z.string())
      .optional()
      .describe(
        "Facet ids or names to include on each row. Defaults to all active facets.",
      ),
    includeTotal: z
      .boolean()
      .optional()
      .describe("Count all matching traces. Defaults to false."),
    truncateSummaries: z
      .boolean()
      .optional()
      .describe("Truncate summaries to 500 characters. Defaults to true."),
    orderBy: z.enum(["timestamp.desc", "timestamp.asc"]).optional(),
    limit: z
      .number()
      .int()
      .positive()
      .max(MCP_TOPIC_TRACES_MAX_LIMIT)
      .optional()
      .describe(
        `Traces per page. Defaults to 20, at most ${MCP_TOPIC_TRACES_MAX_LIMIT}.`,
      ),
    cursor: z.string().optional().describe("meta.cursor of the previous page."),
  }),
  inputSchema: GetUnstableTopicTracesQuery.extend({
    ...filterInput,
    facets: z.array(z.string()).optional(),
    includeTotal: z.boolean().default(false),
    truncateSummaries: z.boolean().default(true),
    limit: z
      .number()
      .int()
      .positive()
      .max(MCP_TOPIC_TRACES_MAX_LIMIT)
      .default(20),
  }),
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.topics.get_for_traces",
      context,
      attributes: { "mcp.pagination_limit": input.limit },
      fn: async (span) => {
        const result = await withAllowedValues(() =>
          listPublicTopicTraces({ projectId: context.projectId, ...input }),
        );
        span.setAttribute("mcp.result_count", result.data.length);
        return result;
      },
    }),
  readOnlyHint: true,
});
