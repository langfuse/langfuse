import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type QueryType } from "@langfuse/shared/query";
import {
  type ChartDrilldown,
  type DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  buildV4TracesChartDrilldownPath,
  serializePivotDrilldownDimensions,
} from "@/src/features/events/lib/chartDrilldownPaths";
import { formatMetricName } from "@/src/features/widgets/utils";

export type WidgetMetricConfig = {
  measure: string;
  agg: string;
};

export type WidgetDimensionConfig = {
  field: string;
};

type PrepareWidgetChartDataParams = {
  rows: Array<Record<string, unknown>> | undefined;
  projectId: string;
  query: QueryType;
  chartType: DashboardWidgetChartType;
  metrics: WidgetMetricConfig[];
  dimensions: WidgetDimensionConfig[];
  isV4Enabled: boolean;
  entityDimensionLabelMap?: Record<string, string>;
};

const toChartDrilldown = (href: string | null): ChartDrilldown | undefined =>
  href ? { href } : undefined;

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const formatDimensionValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined || value === "") return "n/a";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
};

const getXAxisValue = (
  item: Record<string, unknown>,
  entityDimensionLabelMap?: Record<string, string>,
): string | undefined => {
  if (item["entity_dimension"] !== undefined) {
    const entityDimensionValue = String(item["entity_dimension"]);
    const entityDimensionLabel =
      entityDimensionLabelMap?.[entityDimensionValue];
    return entityDimensionLabel && entityDimensionLabel.length > 0
      ? entityDimensionLabel
      : entityDimensionValue;
  }

  if (item["time_dimension"] !== undefined) {
    return String(item["time_dimension"]);
  }

  return undefined;
};

const buildBaseDrilldown = (params: {
  projectId: string;
  query: QueryType;
  isV4Enabled: boolean;
}): ChartDrilldown | undefined => {
  if (!params.isV4Enabled) return undefined;

  return toChartDrilldown(
    buildV4TracesChartDrilldownPath({
      projectId: params.projectId,
      query: params.query,
      mark: { type: "base" },
    }),
  );
};

const buildPointDrilldown = (params: {
  item: Record<string, unknown>;
  projectId: string;
  query: QueryType;
  chartType: DashboardWidgetChartType;
  dimensionField: string | undefined;
  isV4Enabled: boolean;
}): ChartDrilldown | undefined => {
  if (!params.isV4Enabled) return undefined;

  if (params.chartType === "NUMBER" || params.chartType === "HISTOGRAM") {
    return buildBaseDrilldown(params);
  }

  const hasDimension =
    params.dimensionField !== undefined &&
    hasOwn(params.item, params.dimensionField);

  const dimension = hasDimension
    ? {
        field: params.dimensionField!,
        value: params.item[params.dimensionField!],
      }
    : undefined;

  if (params.query.timeDimension) {
    return toChartDrilldown(
      buildV4TracesChartDrilldownPath({
        projectId: params.projectId,
        query: params.query,
        mark: {
          type: "timeSeries",
          bucketStart:
            params.item["time_dimension"] === undefined
              ? undefined
              : String(params.item["time_dimension"]),
          dimension,
        },
      }),
    );
  }

  if (
    params.query.entityDimension &&
    params.item["entity_dimension"] !== undefined
  ) {
    return toChartDrilldown(
      buildV4TracesChartDrilldownPath({
        projectId: params.projectId,
        query: params.query,
        mark: {
          type: "entity",
          entity: {
            field: params.query.entityDimension.field,
            value: params.item["entity_dimension"],
          },
          dimension:
            dimension?.field === params.query.entityDimension.field
              ? undefined
              : dimension,
        },
      }),
    );
  }

  if (dimension) {
    return toChartDrilldown(
      buildV4TracesChartDrilldownPath({
        projectId: params.projectId,
        query: params.query,
        mark: {
          type: "dimension",
          field: dimension.field,
          value: dimension.value,
        },
      }),
    );
  }

  return buildBaseDrilldown(params);
};

const buildHistogramBinDrilldowns = (params: {
  metricValue: unknown;
  metric: WidgetMetricConfig;
  projectId: string;
  query: QueryType;
  isV4Enabled: boolean;
}): Array<ChartDrilldown | undefined> | undefined => {
  if (!params.isV4Enabled || !Array.isArray(params.metricValue)) {
    return undefined;
  }

  return (params.metricValue as Array<[number, number, number]>).map(
    ([lower, upper], index, bins) =>
      toChartDrilldown(
        buildV4TracesChartDrilldownPath({
          projectId: params.projectId,
          query: params.query,
          mark: {
            type: "histogramBin",
            measure: params.metric.measure,
            lower,
            upper,
            isLastBin: index === bins.length - 1,
          },
        }),
      ),
  );
};

const buildPivotDrilldownLookup = (params: {
  rows: Array<Record<string, unknown>>;
  dimensions: WidgetDimensionConfig[];
  projectId: string;
  query: QueryType;
  isV4Enabled: boolean;
}): Record<string, ChartDrilldown | undefined> | undefined => {
  if (!params.isV4Enabled) return undefined;

  const lookup: Record<string, ChartDrilldown | undefined> = {};
  lookup[serializePivotDrilldownDimensions({})] = buildBaseDrilldown(params);

  for (const row of params.rows) {
    const prefix: Record<string, unknown> = {};

    for (const dimension of params.dimensions) {
      if (!hasOwn(row, dimension.field)) break;

      prefix[dimension.field] = row[dimension.field];
      const dimensions = Object.entries(prefix).map(([field, value]) => ({
        field,
        value,
      }));

      lookup[serializePivotDrilldownDimensions(prefix)] = toChartDrilldown(
        buildV4TracesChartDrilldownPath({
          projectId: params.projectId,
          query: params.query,
          mark: { type: "pivot", dimensions },
        }),
      );
    }
  }

  return lookup;
};

export function prepareWidgetChartData({
  rows,
  projectId,
  query,
  chartType,
  metrics,
  dimensions,
  isV4Enabled,
  entityDimensionLabelMap,
}: PrepareWidgetChartDataParams): DataPoint[] {
  if (!rows) {
    return [];
  }

  const metric = metrics[0] ?? {
    measure: "count",
    agg: "count",
  };
  const metricField = `${metric.agg}_${metric.measure}`;
  const dimensionField = dimensions[0]?.field;

  if (chartType === "PIVOT_TABLE") {
    const pivotDrilldownByDimensions = buildPivotDrilldownLookup({
      rows,
      dimensions,
      projectId,
      query,
      isV4Enabled,
    });

    return rows.map((item) => {
      const timeDimension = item["time_dimension"];
      return {
        dimension:
          dimensions.length > 0
            ? (dimensions[0]?.field ?? "dimension")
            : "dimension",
        metric: 0,
        time_dimension:
          typeof timeDimension === "string"
            ? timeDimension
            : String(timeDimension ?? "n/a"),
        drilldown:
          pivotDrilldownByDimensions?.[serializePivotDrilldownDimensions({})],
        pivotDrilldownByDimensions,
        ...item,
      };
    });
  }

  const mapped = rows.map((item): DataPoint => {
    const metricValue = item[metricField];

    const seriesDimension =
      dimensionField && item[dimensionField] !== undefined
        ? formatDimensionValue(item[dimensionField])
        : formatMetricName(metricField);

    return {
      time_dimension: getXAxisValue(item, entityDimensionLabelMap),
      dimension: seriesDimension,
      metric: Array.isArray(metricValue)
        ? (metricValue as Array<Array<number>>)
        : Number(metricValue || 0),
      drilldown: buildPointDrilldown({
        item,
        projectId,
        query,
        chartType,
        dimensionField,
        isV4Enabled,
      }),
      histogramBinDrilldowns:
        chartType === "HISTOGRAM"
          ? buildHistogramBinDrilldowns({
              metricValue,
              metric,
              projectId,
              query,
              isV4Enabled,
            })
          : undefined,
    };
  });

  if (
    entityDimensionLabelMap &&
    Object.keys(entityDimensionLabelMap).length > 0
  ) {
    const order = new Map<string, number>();
    Object.entries(entityDimensionLabelMap).forEach(([id, name], index) => {
      order.set(id, index);
      order.set(name, index);
    });
    return mapped
      .slice()
      .sort(
        (a, b) =>
          (order.get(b.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER) -
          (order.get(a.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER),
      );
  }

  return mapped;
}
