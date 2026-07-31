import { InvalidRequestError } from "@langfuse/shared";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  dimension,
  metric,
  validateQuery,
  viewDeclarations,
  viewsV2,
} from "@langfuse/shared/query";
import {
  MetricsQueryObjectV2,
  publicGranularities,
} from "@/src/features/public-api/types/metrics";
import { defineTool } from "../../../core/define-tool";
import { McpAdvancedFilterBaseSchema } from "../../../core/filter-schema";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { z } from "zod";

const DEFAULT_ROW_LIMIT = 100;
const RAW_OBSERVATION_PAYLOAD_FIELDS = new Set(["input", "output"]);

const getRawObservationPayloadFields = (
  input: z.infer<typeof MetricsQueryObjectV2>,
) => {
  const fields = [
    ...input.dimensions.map((dimension) => dimension.field),
    ...input.metrics.map((metric) => metric.measure),
    ...input.filters.map((filter) => filter.column),
  ];

  return [...new Set(fields)].filter((field) =>
    RAW_OBSERVATION_PAYLOAD_FIELDS.has(field),
  );
};

const getHighCardinalityDimensionFields = (
  input: z.infer<typeof MetricsQueryObjectV2>,
) =>
  input.dimensions
    .map((dimension) => dimension.field)
    .filter(
      (field) =>
        viewDeclarations.v2[input.view].dimensions[field]?.highCardinality,
    );

const getHighCardinalityGuidance = (
  input: z.infer<typeof MetricsQueryObjectV2>,
  reason: string,
) => {
  const fields = getHighCardinalityDimensionFields(input);
  if (fields.length === 0) {
    return reason;
  }

  const schemaReminder = ` Call getMetricsSchema({"view":"${input.view}"}) for supported fields and metric aliases.`;

  if (input.timeDimension) {
    return `${reason} Remove ${fields.join(", ")} or remove timeDimension; config.row_limit and orderBy cannot make this combination safe.${schemaReminder}`;
  }

  const orderByMetric = input.metrics.find(
    (metric) => metric.aggregation !== "histogram",
  );
  if (!orderByMetric) {
    return `${reason}${schemaReminder}`;
  }

  const orderByField = `${orderByMetric.aggregation}_${orderByMetric.measure}`;
  return `${reason} For a non-timeseries top-N query, add {"config":{"row_limit":100},"orderBy":[{"field":"${orderByField}","direction":"desc"}]}.${schemaReminder}`;
};

const normalizeMetricFilters = (
  input: z.infer<typeof MetricsQueryObjectV2>,
): z.infer<typeof MetricsQueryObjectV2> => {
  const tagsDimension = viewDeclarations.v2[input.view].dimensions.tags;
  const tagsAreArray =
    tagsDimension?.type === "string[]" || tagsDimension?.type === "arrayString";

  if (!tagsAreArray) {
    return input;
  }

  return {
    ...input,
    filters: input.filters.map((filter) => {
      if (filter.column !== "tags") {
        return filter;
      }

      if (filter.type === "string" && filter.operator === "=") {
        return {
          type: "arrayOptions",
          column: filter.column,
          operator: "any of",
          value: [filter.value],
        };
      }

      if (filter.type === "stringOptions") {
        return {
          ...filter,
          type: "arrayOptions",
        };
      }

      return filter;
    }),
  };
};

const normalizeMetricOrderByFields = (
  input: z.infer<typeof MetricsQueryObjectV2>,
) => {
  if (!input.orderBy) {
    return input;
  }

  const metricAliases = input.metrics.map(
    (metric) => `${metric.aggregation}_${metric.measure}`,
  );
  const reversedMetricAliases = new Map(
    input.metrics.map((metric) => [
      `${metric.measure}_${metric.aggregation}`,
      `${metric.aggregation}_${metric.measure}`,
    ]),
  );
  const allowedOrderByFields = new Set([
    ...input.dimensions.map((dimension) => dimension.field),
    ...metricAliases,
    ...(input.timeDimension ? ["time_dimension"] : []),
  ]);

  return {
    ...input,
    orderBy: input.orderBy.map((orderBy) => {
      const isDimensionField = input.dimensions.some(
        (dimension) => dimension.field === orderBy.field,
      );
      const matchingMetrics = isDimensionField
        ? []
        : input.metrics.filter((metric) => metric.measure === orderBy.field);
      const normalizedField = isDimensionField
        ? orderBy.field
        : matchingMetrics.length === 1
          ? `${matchingMetrics[0].aggregation}_${matchingMetrics[0].measure}`
          : (reversedMetricAliases.get(orderBy.field) ?? orderBy.field);

      if (!allowedOrderByFields.has(normalizedField)) {
        throw new InvalidRequestError(
          `Invalid orderBy field: ${orderBy.field}. Use returned metric aliases like 'sum_totalCost' or fields returned by getMetricsSchema.`,
        );
      }

      return {
        ...orderBy,
        field: normalizedField,
      };
    }),
  };
};

const MetricsQueryObjectV2BaseSchema = z.object({
  view: viewsV2,
  dimensions: z.array(dimension).optional().default([]),
  metrics: z.array(metric),
  filters: z.array(McpAdvancedFilterBaseSchema).optional().default([]),
  timeDimension: z
    .object({
      granularity: publicGranularities,
    })
    .optional(),
  fromTimestamp: z.iso.datetime({ offset: true }),
  toTimestamp: z.iso.datetime({ offset: true }),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  config: z
    .object({
      bins: z.number().int().min(1).max(100).optional(),
      row_limit: z.number().int().positive().lte(1000).optional(),
    })
    .optional(),
});

export const [queryMetricsTool, handleQueryMetrics] = defineTool({
  name: "queryMetrics",
  description:
    "Answer analytics questions about the current Langfuse project, such as usage over time, model costs, latency, errors, scores, or grouped breakdowns by environment, trace, observation, model, user, session, tag, or score name.",
  baseSchema: MetricsQueryObjectV2BaseSchema,
  inputSchema: MetricsQueryObjectV2,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.metrics.query",
      context,
      attributes: {
        "mcp.metrics_view": input.view,
      },
      fn: async () => {
        const normalizedInput = normalizeMetricOrderByFields(
          normalizeMetricFilters(input),
        );
        const rawPayloadFields =
          getRawObservationPayloadFields(normalizedInput);

        if (rawPayloadFields.length > 0) {
          throw new InvalidRequestError(
            `Raw observation ${rawPayloadFields.join(" and ")} is not available from queryMetrics. Use listObservations with traceId, an exact id filter, or both fromStartTime and toStartTime; call getObservationFilterSchema for supported observation filters.`,
          );
        }

        const validation = validateQuery(normalizedInput, "v2");

        if (!validation.valid) {
          throw new InvalidRequestError(
            getHighCardinalityGuidance(normalizedInput, validation.reason),
          );
        }

        const { config, ...query } = normalizedInput;
        const queryParams = {
          ...query,
          chartConfig: {
            type: "TABLE",
            ...config,
            row_limit: config?.row_limit ?? DEFAULT_ROW_LIMIT,
          },
        };

        const result = await executeQuery(
          context.projectId,
          queryParams,
          "v2",
          true,
        );

        return { data: result };
      },
    });
  },
  readOnlyHint: true,
});
