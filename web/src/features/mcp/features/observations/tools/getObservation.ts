import { SpanKind } from "@opentelemetry/api";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { z } from "zod";
import {
  getObservationsV2FromEventsTableForPublicApi,
  instrumentAsync,
} from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import {
  ExpandMetadataKeysSchema,
  getMetadataExpansionForProjection,
  ObservationFieldsSchema,
  getProjectionFieldGroups,
  getProjectionFields,
  projectObservation,
} from "../schema";

const GetObservationBaseSchema = z.object({
  observationId: z.string().min(1),
  fields: ObservationFieldsSchema,
  expandMetadataKeys: ExpandMetadataKeysSchema,
});

export const [getObservationTool, handleGetObservation] = defineTool({
  name: "getObservation",
  description: [
    "Get the details for a single observation in the current Langfuse project by observation ID.",
    "Use this when you already know the observation ID and want to inspect its timing, model, status, payload, metadata, usage, cost, or prompt fields.",
    "",
    'By default this returns compact summary fields. Use fields: ["*"] for the full observation, or pass specific field names to limit the response size.',
  ].join("\n"),
  baseSchema: GetObservationBaseSchema,
  inputSchema: GetObservationBaseSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.observations.get", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const projectionFields = getProjectionFields(input.fields);
        const fieldGroups = getProjectionFieldGroups(projectionFields);

        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.observation_id": input.observationId,
          "mcp.projection_fields": projectionFields.join(","),
          "mcp.field_groups": fieldGroups.join(","),
        });

        const items = await getObservationsV2FromEventsTableForPublicApi({
          projectId: context.projectId,
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
        });

        const observation = items.find(
          (item) => item.id === input.observationId,
        );
        if (!observation) {
          throw new LangfuseNotFoundError(
            `Observation ${input.observationId} not found`,
          );
        }

        return projectObservation(
          {
            ...observation,
            parentObservationId:
              observation.parentObservationId === ""
                ? null
                : observation.parentObservationId,
          },
          projectionFields,
        );
      },
    );
  },
  readOnlyHint: true,
});
