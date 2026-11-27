import { isoDateTime, LangfuseNotFoundError } from "@langfuse/shared";
import { z } from "zod";
import {
  getObservationsV2FromEventsTableForPublicApi,
  buildObservationUrl,
} from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { observationRefs } from "@/src/features/audit-logs/server/auditedQuery";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  ExpandMetadataKeysSchema,
  getMetadataExpansionForProjection,
  ObservationFieldsSchema,
  getProjectionFieldGroups,
  getProjectionFields,
  projectObservation,
} from "../schema";

const OBSERVATION_MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const GetObservationBaseSchema = z.object({
  observationId: z.string().min(1),
  traceId: z.string().min(1).optional(),
  fromStartTime: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone (Z or offset).",
  ),
  toStartTime: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone, at most 2160 hours after fromStartTime and strictly after the observation's startTime.",
  ),
  fields: ObservationFieldsSchema,
  expandMetadataKeys: ExpandMetadataKeysSchema,
});

export const [getObservationTool, handleGetObservation] = defineTool({
  name: "getObservation",
  description: [
    "Get one observation by ID to inspect its timing, model, status, payload, metadata, usage, cost, or prompt fields. Returns compact default fields; request full input/output only where needed.",
    "Requires fromStartTime (inclusive) and toStartTime (exclusive) at most 2160 elapsed hours (90 days) apart; traceId does not replace them. Reuse the startTime and traceId from earlier results to narrow the lookup.",
  ].join("\n"),
  action: "traces:read",
  accessAudit: {
    resourceType: "observation",
    action: "read",
    idKey: "observationId",
  },
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
        "getObservation requires fromStartTime before toStartTime with a maximum range of 90 days (2160 elapsed hours). Use a narrower window containing the observation startTime; toStartTime is exclusive.",
      path: ["toStartTime"],
    },
  ),
  handler: async (input, context, audit) => {
    return await runMcpTool({
      spanName: "mcp.observations.get",
      context,
      attributes: { "mcp.observation_id": input.observationId },
      fn: async () => {
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
            clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
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
        audit.refs(observationRefs([observation]));

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
  annotations: { readOnlyHint: true },
});
