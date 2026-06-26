import { InvalidRequestError, ObservationTypeDomain } from "@langfuse/shared";
import { getObservationMetadataKeysFromEventsTable } from "@langfuse/shared/src/server";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { ObservationLimitSchema } from "../schema";

const MAX_OBSERVATION_IDS = 100;
const MAX_TIME_RANGE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const GetObservationFilterMetadataKeysBaseSchema = z.object({
  observationIds: z
    .array(z.string())
    .max(MAX_OBSERVATION_IDS)
    .optional()
    .describe(`Observation IDs to inspect.`),
  traceId: z
    .string()
    .optional()
    .describe("Trace ID to scope metadata key discovery."),
  fromStartTime: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "Inclusive observation start-time lower bound. Required with toStartTime when neither observationIds nor traceId is provided.",
    ),
  toStartTime: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "Exclusive observation start-time upper bound. Required with fromStartTime when neither observationIds nor traceId is provided. Time ranges are limited to 24 hours.",
    ),
  type: ObservationTypeDomain.optional(),
  limit: ObservationLimitSchema,
  cursor: z
    .string()
    .optional()
    .describe(
      "Cursor returned by a previous getObservationFilterMetadataKeys call",
    ),
});

const GetObservationFilterMetadataKeysInputSchema =
  GetObservationFilterMetadataKeysBaseSchema.superRefine((input, ctx) => {
    if (!input.fromStartTime || !input.toStartTime) {
      return;
    }

    const rangeMs =
      new Date(input.toStartTime).getTime() -
      new Date(input.fromStartTime).getTime();

    if (rangeMs <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "fromStartTime must be before toStartTime",
        path: ["fromStartTime"],
      });
    }

    if (rangeMs > MAX_TIME_RANGE_MS) {
      ctx.addIssue({
        code: "custom",
        message:
          "Observation metadata key discovery time ranges are limited to 24 hours.",
        path: ["toStartTime"],
      });
    }
  });

// The cursor is just a base64-encoded JSON string containing the offset for pagination.
// Therefore we need to encode and decode it when sending to and receiving from the client.
const decodeObservationFilterMetadataKeysCursor = (
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
    // Fall through to the standard validation error.
  }

  throw new InvalidRequestError("Invalid cursor format");
};

// The cursor is just a base64-encoded JSON string containing the offset for pagination.
// Therefore we need to encode and decode it when sending to and receiving from the client.
const encodeObservationFilterMetadataKeysCursor = (offset: number): string => {
  return Buffer.from(JSON.stringify({ offset })).toString("base64");
};

export const [
  getObservationFilterMetadataKeysTool,
  handleGetObservationFilterMetadataKeys,
] = defineTool({
  name: "getObservationFilterMetadataKeys",
  description: [
    "List metadata keys observed on observations.",
    "Use this for discovering metadata keys to use in listObservations filter items with column: metadata and type: stringObject.",
  ].join("\n"),
  baseSchema: GetObservationFilterMetadataKeysBaseSchema,
  inputSchema: GetObservationFilterMetadataKeysInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.observations.metadataKeys",
      context,
      attributes: {
        "mcp.pagination_limit": input.limit,
        "mcp.has_observation_ids": Boolean(input.observationIds?.length),
        "mcp.has_trace_id": Boolean(input.traceId),
      },
      fn: async () => {
        let fromStartTime: Date | undefined;
        let toStartTime: Date | undefined;
        if (input.fromStartTime && input.toStartTime) {
          fromStartTime = new Date(input.fromStartTime);
          toStartTime = new Date(input.toStartTime);
        }

        if (
          !input.observationIds?.length &&
          !input.traceId &&
          !(fromStartTime && toStartTime)
        ) {
          throw new InvalidRequestError(
            "Observation metadata key discovery requires observationIds, traceId, or a bounded start time range of at most 24 hours.",
          );
        }

        const offset = decodeObservationFilterMetadataKeysCursor(input.cursor);

        const rows = await getObservationMetadataKeysFromEventsTable({
          projectId: context.projectId,
          observationIds: input.observationIds,
          traceId: input.traceId,
          fromStartTime,
          toStartTime,
          type: input.type,
          limit: input.limit + 1,
          offset,
        });

        const hasMore = rows.length > input.limit;
        const keys = hasMore ? rows.slice(0, input.limit) : rows;

        return {
          keys,
          meta: hasMore
            ? {
                cursor: encodeObservationFilterMetadataKeysCursor(
                  offset + input.limit,
                ),
              }
            : {},
        };
      },
    });
  },
  readOnlyHint: true,
});
