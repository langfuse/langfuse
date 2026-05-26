import {
  getValidAggregationsForMeasureType,
  granularities,
  viewsV2,
  viewDeclarations,
} from "@langfuse/shared/query";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetMetricsSchemaInput = z.object({
  view: viewsV2
    .optional()
    .describe("Limit the response to one v2 metrics view"),
});

export const [getMetricsSchemaTool, handleGetMetricsSchema] = defineTool({
  name: "getMetricsSchema",
  description:
    "Discover which Langfuse metrics can be analyzed and how to group, filter, aggregate, and time-bucket them before calling queryMetrics.",
  baseSchema: GetMetricsSchemaInput,
  inputSchema: GetMetricsSchemaInput,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.metrics.schema",
      context,
      attributes: { "mcp.metrics_view": input.view },
      fn: async () => {
        const supportedViews = viewsV2.options;
        const selectedViews = input.view ? [input.view] : supportedViews;

        return {
          supportedViews,
          granularities: granularities.options,
          config: {
            bins: { min: 1, max: 100 },
            row_limit: { min: 1, max: 1000, default: 100 },
          },
          views: Object.fromEntries(
            selectedViews.map((viewName) => {
              const view = viewDeclarations.v2[viewName];

              return [
                viewName,
                {
                  description: view.description,
                  timeDimension: view.timeDimension,
                  dimensions: Object.fromEntries(
                    Object.entries(view.dimensions).map(
                      ([name, definition]) => [
                        name,
                        {
                          description: definition.description,
                          type: definition.type,
                          unit: definition.unit,
                          highCardinality: Boolean(definition.highCardinality),
                        },
                      ],
                    ),
                  ),
                  measures: Object.fromEntries(
                    Object.entries(view.measures).map(([name, definition]) => [
                      name,
                      {
                        description: definition.description,
                        type: definition.type,
                        unit: definition.unit,
                        validAggregations: getValidAggregationsForMeasureType(
                          definition.type,
                        ),
                      },
                    ]),
                  ),
                },
              ];
            }),
          ),
        };
      },
    });
  },
  readOnlyHint: true,
});
