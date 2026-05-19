import { SpanKind } from "@opentelemetry/api";
import {
  InvalidRequestError,
  ObservationTypeDomain,
  type timeFilter,
} from "@langfuse/shared";
import { z } from "zod";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { getEventFilterOptions } from "@/src/features/events/server/eventsService";
import { defineTool } from "../../../core/define-tool";
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
  "modelId",
  "providedModelName",
  "tags",
  "hasParentObservation",
] as const satisfies readonly ObservationMcpFilterColumn[];

const FilterValueColumnSchema = z.enum(OBSERVATION_MCP_FILTER_VALUE_COLUMNS);

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
  column: z.infer<typeof FilterValueColumnSchema>,
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
    .filter((value): value is FilterOption => value !== null)
    .sort((a, b) => String(a.value).localeCompare(String(b.value)));
};

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

const encodeObservationFilterValueCursor = (offset: number): string => {
  return Buffer.from(JSON.stringify({ offset })).toString("base64");
};

export const [
  getObservationFilterValuesTool,
  handleGetObservationFilterValues,
] = defineTool({
  name: "getObservationFilterValues",
  description:
    "List available values for an observation filter field, such as names, types, levels, environments, model names, tags, users, or sessions. Use the returned cursor to page through long value lists.",
  baseSchema: GetObservationFilterValuesBaseSchema,
  inputSchema: GetObservationFilterValuesBaseSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.observations.filterValues", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.filter_column": input.column,
          "mcp.pagination_limit": input.limit,
        });

        const startTimeFilter = buildStartTimeFilter({
          fromStartTime: input.fromStartTime,
          toStartTime: input.toStartTime,
        });

        const options = await getEventFilterOptions({
          projectId: context.projectId,
          startTimeFilter,
          hasParentObservation: input.hasParentObservation,
          observationType: input.observationType,
        });

        const optionKey = input.column === "tags" ? "traceTags" : input.column;
        const values = options[optionKey];

        if (!Array.isArray(values)) {
          throw new InvalidRequestError(
            `Filter values are not available for column ${input.column}`,
          );
        }

        const normalizedValues = normalizeFilterOptions(values, input.column);

        const offset = decodeObservationFilterValueCursor(input.cursor);
        const page = normalizedValues.slice(offset, offset + input.limit);
        const nextOffset = offset + page.length;

        return {
          column: input.column,
          values: page,
          meta:
            nextOffset < normalizedValues.length
              ? { cursor: encodeObservationFilterValueCursor(nextOffset) }
              : {},
        };
      },
    );
  },
  readOnlyHint: true,
});
