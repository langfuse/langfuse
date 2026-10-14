import { LangfuseNotFoundError } from "@langfuse/shared";
import { z } from "zod";
import {
  getObservationsV2FromEventsTableForPublicApi,
  buildObservationUrl,
} from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { clampToDataAccessDays } from "@/src/features/entitlements/server";
import {
  ExpandMetadataKeysSchema,
  getMetadataExpansionForProjection,
  ObservationFieldsSchema,
  getProjectionFieldGroups,
  getProjectionFields,
  projectObservation,
} from "../schema";

const OBSERVATION_MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MCP_OBSERVATIONS_MAX_EXECUTION_TIME_SECONDS = 25;

const GetObservationBaseSchema = z.object({
  observationId: z.string().min(1),
  traceId: z.string().min(1).optional(),
  fromStartTime: z.iso.datetime({ offset: true }),
  toStartTime: z.iso.datetime({ offset: true }),
  fields: ObservationFieldsSchema,
  expandMetadataKeys: ExpandMetadataKeysSchema,
});

export const [getObservationTool, handleGetObservation] = defineTool({
  name: "getObservation",
  description: [
    "Get the details for a single observation in the current Langfuse project by observation ID.",
    "Use this when you already know the observation ID and want to inspect its timing, model, status, payload, metadata, usage, cost, or prompt fields.",
    "Requires explicit fromStartTime and toStartTime with a positive range of at most 90 days. Reuse the observation startTime and traceId from earlier results to narrow the lookup; traceId does not replace time bounds.",
    "",
    'By default this returns compact summary fields. Use fields: ["*"] for the full observation, or pass specific field names to limit the response size.',
    'Important: if you request metadata explicitly, for example fields: ["id", "metadata"], metadata values are truncated to 200 UTF-8 characters per key unless you also pass expandMetadataKeys with the keys that may need full values.',
  ].join("\n"),
  action: "traces:read",
  baseSchema: GetObservationBaseSchema,
  inputSchema: GetObservationBaseSchema.refine(
    (input) => {
      const rangeMs =
        new Date(input.toStartTime).getTime() -
        new Date(input.fromStartTime).getTime();
      return rangeMs > 0 && rangeMs <= OBSERVATION_MAX_RANGE_MS;
    },
    {
      message:
        "getObservation requires fromStartTime before toStartTime with a maximum range of 90 days.",
      path: ["toStartTime"],
    },
  ),
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.observations.get",
      context,
      attributes: { "mcp.observation_id": input.observationId },
      fn: async (span) => {
        const dataAccessWindow = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: input.fromStartTime,
        });
        if (
          dataAccessWindow.accessFloor &&
          dataAccessWindow.accessFloor >= new Date(input.toStartTime)
        ) {
          throw new LangfuseNotFoundError(
            `Observation ${input.observationId} not found within the supplied period (${input.fromStartTime} to ${input.toStartTime}).`,
          );
        }

        const projectionFields = getProjectionFields(input.fields);
        const fieldGroups = getProjectionFieldGroups(projectionFields);

        span.setAttributes({
          "mcp.projection_fields": projectionFields.join(","),
          "mcp.field_groups": fieldGroups.join(","),
        });

        const items = await getObservationsV2FromEventsTableForPublicApi(
          {
            projectId: context.projectId,
            traceId: input.traceId,
            fromStartTime:
              dataAccessWindow.effectiveFromTimestamp?.toISOString(),
            toStartTime: input.toStartTime,
            page: 0,
            limit: 1,
            fields: fieldGroups,
            advancedFilters: [
              {
                type: "stringOptions",
                column: "id",
                operator: "any of",
                value: [input.observationId],
              },
            ],
            expandMetadataKeys: getMetadataExpansionForProjection(
              projectionFields,
              input.expandMetadataKeys,
            ),
          },
          {
            clickhouseSettings: {
              max_execution_time: MCP_OBSERVATIONS_MAX_EXECUTION_TIME_SECONDS,
            },
          },
        );

        const observation = items.find(
          (item) => item.id === input.observationId,
        );
        if (!observation) {
          throw new LangfuseNotFoundError(
            `Observation ${input.observationId} not found within the supplied period (${input.fromStartTime} to ${input.toStartTime}).`,
          );
        }

        const projectedObservation = projectObservation(
          {
            ...observation,
            parentObservationId:
              observation.parentObservationId === ""
                ? null
                : observation.parentObservationId,
          },
          projectionFields,
        );

        return {
          ...projectedObservation,
          ...(observation.traceId
            ? {
                url: buildObservationUrl({
                  projectId: context.projectId,
                  traceId: observation.traceId,
                  observationId: observation.id,
                }),
              }
            : {}),
        };
      },
    });
  },
  readOnlyHint: true,
});
