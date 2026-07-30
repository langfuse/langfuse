import {
  getValidAggregationsForMeasureType,
  viewsV2,
  viewDeclarations,
} from "@langfuse/shared/query";
import { filterOperators } from "@langfuse/shared";
import { publicGranularities } from "@/src/features/public-api/types/metrics";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const HIGH_CARDINALITY_CONSTRAINT =
  "When used in dimensions, requires explicit config.row_limit and orderBy descending on a measure selected in the query; incompatible with timeDimension and with combining entityDimension with an additional high-cardinality dimension. The default row_limit is applied after validation and does not satisfy this requirement. When used as entityDimension, requires a same-field '=' filter with a non-empty value or an 'any of' filter with 1-50 non-empty values.";

// Unknown shared dimension types remain safe to ignore at runtime. The MCP
// response test requires every declared, typed dimension to be mapped here.
const FILTER_TYPE_BY_DIMENSION_TYPE = {
  string: "string",
  stringOptions: "stringOptions",
  "string[]": "arrayOptions",
  arrayString: "arrayOptions",
  integer: "number",
  decimal: "number",
  number: "number",
  boolean: "boolean",
} as const satisfies Record<string, keyof typeof filterOperators>;

const isFilterableDimensionType = (
  type: string,
): type is keyof typeof FILTER_TYPE_BY_DIMENSION_TYPE =>
  Object.hasOwn(FILTER_TYPE_BY_DIMENSION_TYPE, type);

const getFilterMetadata = (
  column: string,
  type: string | undefined,
):
  | {
      column: string;
      filterType: keyof typeof filterOperators;
      operators: readonly string[];
    }
  | undefined => {
  if (!type || !isFilterableDimensionType(type)) {
    return undefined;
  }

  const filterType = FILTER_TYPE_BY_DIMENSION_TYPE[type];
  return {
    column,
    filterType,
    operators: filterOperators[filterType],
  };
};

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
          granularities: publicGranularities.options,
          config: {
            bins: { min: 1, max: 100 },
            row_limit: { min: 1, max: 1000, default: 100 },
          },
          views: Object.fromEntries(
            selectedViews.map((viewName) => {
              const view = viewDeclarations.v2[viewName];
              const filterableColumns = [
                ...Object.entries(view.dimensions)
                  .map(([name, definition]) =>
                    getFilterMetadata(name, definition.type),
                  )
                  .filter((item) => item !== undefined),
                {
                  column: view.timeDimension,
                  filterType: "datetime" as const,
                  operators: filterOperators.datetime,
                },
                {
                  column: "metadata",
                  filterType: "stringObject" as const,
                  operators: filterOperators.stringObject,
                  requiresKey: true as const,
                },
              ];
              const orderByFields = Object.keys(view.dimensions)
                .concat(
                  Object.entries(view.measures).flatMap(([name, definition]) =>
                    getValidAggregationsForMeasureType(definition.type)
                      .filter((aggregation) => aggregation !== "histogram")
                      .map((aggregation) => `${aggregation}_${name}`),
                  ),
                )
                .concat("time_dimension");

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
                          ...(definition.highCardinality
                            ? { constraints: HIGH_CARDINALITY_CONSTRAINT }
                            : {}),
                        },
                      ],
                    ),
                  ),
                  filterableColumns,
                  orderByFields,
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
