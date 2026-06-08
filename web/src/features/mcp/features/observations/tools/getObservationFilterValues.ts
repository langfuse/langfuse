import {
  InvalidRequestError,
  ObservationTypeDomain,
  isNumericEventsTableColumnId,
  type timeFilter,
} from "@langfuse/shared";
import { z } from "zod";
import {
  getEventFilterNumericRange,
  getEventFilterValuePage,
} from "@/src/features/events/server/eventsService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  ObservationLimitSchema,
  type ObservationMcpFilterColumn,
} from "../schema";

const OBSERVATION_MCP_FILTER_VALUE_COLUMNS = [
  "name",
  "type",
  "environment",
  "version",
  "userId",
  "sessionId",
  "traceName",
  "level",
  "promptName",
  "promptVersion",
  "modelId",
  "providedModelName",
  "totalCost",
  "totalTokens",
  "latency",
  "timeToFirstToken",
  "tags",
  "hasParentObservation",
] as const satisfies readonly ObservationMcpFilterColumn[];

const FilterValueColumnSchema = z.enum(OBSERVATION_MCP_FILTER_VALUE_COLUMNS);

type FilterValueColumn = z.infer<typeof FilterValueColumnSchema>;

const GetObservationFilterValuesBaseSchema = z.object({
  column: FilterValueColumnSchema,
  fromStartTime: z.iso.datetime({ offset: true }).optional(),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  observationType: ObservationTypeDomain.optional(),
  hasParentObservation: z.boolean().optional(),
  limit: ObservationLimitSchema,
  cursor: z.string().optional(),
});

type FilterOption = {
  value: string | boolean;
  count?: number;
};

const buildStartTimeFilter = (params: {
  fromStartTime?: string;
  toStartTime?: string;
}): z.infer<typeof timeFilter>[] => {
  const filters: z.infer<typeof timeFilter>[] = [];

  if (params.fromStartTime) {
    filters.push({
      column: "startTime",
      operator: ">=",
      value: new Date(params.fromStartTime),
      type: "datetime",
    });
  }

  if (params.toStartTime) {
    filters.push({
      column: "startTime",
      operator: "<",
      value: new Date(params.toStartTime),
      type: "datetime",
    });
  }

  return filters;
};

const normalizeFilterOptions = (
  values: unknown[],
  column: FilterValueColumn,
): FilterOption[] => {
  const normalizeValue = (value: unknown): string | boolean | null => {
    if (typeof value === "string") {
      // Special handling for the "hasParentObservation" column to convert "true"/"false" strings to boolean values.
      if (column === "hasParentObservation") {
        if (value === "true") return true;
        if (value === "false") return false;
      }
      return value;
    }

    if (typeof value === "boolean") return value;

    return null;
  };

  return values
    .map((value): FilterOption | null => {
      const normalizedPrimitive = normalizeValue(value);
      if (normalizedPrimitive !== null) return { value: normalizedPrimitive };

      if (typeof value === "object" && value !== null && "value" in value) {
        const normalizedObjectValue = normalizeValue(value.value);
        if (normalizedObjectValue === null) return null;

        return {
          value: normalizedObjectValue,
          count:
            "count" in value && typeof value.count === "number"
              ? value.count
              : undefined,
        };
      }
      return null;
    })
    .filter((value): value is FilterOption => value !== null);
};

// The cursor is just a base64-encoded JSON string containing the offset for pagination.
// Therefore we need to encode and decode it when sending to and receiving from the client.
const decodeObservationFilterValueCursor = (
  cursor: string | undefined,
): number => {
  if (!cursor) return 0;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return parsed.offset;
    }
  } catch (_error) {
    // Fall through to the standard public API-style validation error.
  }

  throw new InvalidRequestError("Invalid cursor format");
};

// The cursor is just a base64-encoded JSON string containing the offset for pagination.
// Therefore we need to encode and decode it when sending to and receiving from the client.
const encodeObservationFilterValueCursor = (offset: number): string => {
  return Buffer.from(JSON.stringify({ offset })).toString("base64");
};

export const [
  getObservationFilterValuesTool,
  handleGetObservationFilterValues,
] = defineTool({
  name: "getObservationFilterValues",
  description:
    "List example values for a string or boolean observation filter field, such as names, types, levels, environments, model names, tags, users, or sessions. For numeric metric fields, returns a range with min, max, avg, and count. Use the returned cursor to page through long value lists.",
  baseSchema: GetObservationFilterValuesBaseSchema,
  inputSchema: GetObservationFilterValuesBaseSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.observations.filterValues",
      context,
      attributes: {
        "mcp.filter_column": input.column,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const startTimeFilter = buildStartTimeFilter({
          fromStartTime: input.fromStartTime,
          toStartTime: input.toStartTime,
        });

        const eventsColumn =
          input.column === "tags" ? "traceTags" : input.column;

        if (isNumericEventsTableColumnId(eventsColumn)) {
          const range = await getEventFilterNumericRange({
            column: eventsColumn,
            projectId: context.projectId,
            startTimeFilter,
            hasParentObservation: input.hasParentObservation,
            observationType: input.observationType,
          });

          return {
            type: "RANGE",
            column: input.column,
            range: range ?? null,
            meta: {},
          };
        }

        const offset = decodeObservationFilterValueCursor(input.cursor);

        const page = await getEventFilterValuePage({
          column: eventsColumn,
          projectId: context.projectId,
          startTimeFilter,
          hasParentObservation: input.hasParentObservation,
          observationType: input.observationType,
          limit: input.limit,
          offset,
        });

        if (!Array.isArray(page.values)) {
          throw new InvalidRequestError(
            `Filter values are not available for column ${input.column}`,
          );
        }

        const normalizedValues = normalizeFilterOptions(
          page.values,
          input.column,
        );

        return {
          type: "VALUES",
          column: input.column,
          values: normalizedValues,
          meta:
            page.nextOffset !== undefined
              ? { cursor: encodeObservationFilterValueCursor(page.nextOffset) }
              : {},
        };
      },
    });
  },
  readOnlyHint: true,
});
