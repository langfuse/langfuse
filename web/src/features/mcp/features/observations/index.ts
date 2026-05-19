import type { McpFeatureModule } from "../../server/registry";
import {
  getObservationTool,
  handleGetObservation,
} from "./tools/getObservation";
import {
  getObservationFieldSchemaTool,
  handleGetObservationFieldSchema,
} from "./tools/getObservationFieldSchema";
import {
  getObservationFilterSchemaTool,
  handleGetObservationFilterSchema,
} from "./tools/getObservationFilterSchema";
import {
  getObservationFilterValuesTool,
  handleGetObservationFilterValues,
} from "./tools/getObservationFilterValues";
import {
  listObservationsTool,
  handleListObservations,
} from "./tools/listObservations";

export const observationsFeature: McpFeatureModule = {
  name: "observations",
  description:
    "Inspect generations, spans, events, and other observations in Langfuse",
  tools: [
    {
      definition: listObservationsTool,
      handler: handleListObservations,
    },
    {
      definition: getObservationTool,
      handler: handleGetObservation,
    },
    {
      definition: getObservationFieldSchemaTool,
      handler: handleGetObservationFieldSchema,
    },
    {
      definition: getObservationFilterSchemaTool,
      handler: handleGetObservationFilterSchema,
    },
    {
      definition: getObservationFilterValuesTool,
      handler: handleGetObservationFilterValues,
    },
  ],
};
