import { defineTool } from "../../../core/define-tool";
import {
  OBSERVATION_MCP_DEFAULT_FIELDS,
  OBSERVATION_MCP_FIELD_DEFINITIONS,
} from "../schema";
import { z } from "zod";

const EmptyInputSchema = z.object({});

export const [getObservationFieldSchemaTool, handleGetObservationFieldSchema] =
  defineTool({
    name: "getObservationFieldSchema",
    description:
      "Show which observation fields can be requested from listObservations and getObservation. The response marks default fields and fields that may be large or contain sensitive application data.",
    baseSchema: EmptyInputSchema,
    inputSchema: EmptyInputSchema,
    handler: async () => {
      return {
        resource: "observation",
        defaultFields: OBSERVATION_MCP_DEFAULT_FIELDS,
        fields: Object.fromEntries(
          OBSERVATION_MCP_FIELD_DEFINITIONS.map((definition) => [
            definition.field,
            {
              type: definition.type,
              nullable: Boolean(definition.nullable),
              default: Boolean(definition.default),
              expensive: Boolean(definition.expensive),
              sensitive: Boolean(definition.sensitive),
              ...(definition.description
                ? { description: definition.description }
                : {}),
            },
          ]),
        ),
      };
    },
    readOnlyHint: true,
  });
