import type { z } from "zod";
import {
  DashboardWidgetChartType,
  DashboardWidgetViews,
} from "@langfuse/shared/src/db";
import {
  DashboardService,
  type WidgetDomain,
} from "@langfuse/shared/src/server";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import {
  getValidAggregationsForMeasureType,
  getViewDeclaration,
  type views,
  type ViewVersion,
} from "@langfuse/shared/query";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import {
  PostUnstableDashboardWidgetResponse,
  type PostUnstableDashboardWidgetBodyType,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  getWidgetImportFilterConfig,
  partitionStoredUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";

const viewMapping: Record<
  PostUnstableDashboardWidgetBodyType["view"],
  DashboardWidgetViews
> = {
  observations: DashboardWidgetViews.OBSERVATIONS,
  "scores-numeric": DashboardWidgetViews.SCORES_NUMERIC,
  "scores-categorical": DashboardWidgetViews.SCORES_CATEGORICAL,
};

const reverseViewMapping: Record<
  DashboardWidgetViews,
  z.infer<typeof views>
> = {
  [DashboardWidgetViews.TRACES]: "traces",
  [DashboardWidgetViews.OBSERVATIONS]: "observations",
  [DashboardWidgetViews.SCORES_NUMERIC]: "scores-numeric",
  [DashboardWidgetViews.SCORES_CATEGORICAL]: "scores-categorical",
};

const throwInvalidWidget = (params: {
  message: string;
  field?: string;
  allowedValues?: string[];
}): never => {
  throw createUnstablePublicApiError({
    httpCode: 400,
    code: "invalid_request",
    message: params.message,
    details:
      params.field || params.allowedValues
        ? {
            field: params.field,
            allowedValues: params.allowedValues,
          }
        : undefined,
  });
};

function getWidgetViewVersion(
  widget: PostUnstableDashboardWidgetBodyType,
): ViewVersion {
  return (widget.minVersion ?? 2) >= 2 ? "v2" : "v1";
}

function getPublicDashboardWidgetViewDeclaration(
  widget: PostUnstableDashboardWidgetBodyType,
): ReturnType<typeof getViewDeclaration> {
  const viewVersion = getWidgetViewVersion(widget);

  try {
    return getViewDeclaration(widget.view, viewVersion);
  } catch (error) {
    return throwInvalidWidget({
      message: error instanceof Error ? error.message : "Invalid widget view",
      field: "view",
    });
  }
}

export function normalizePublicDashboardWidgetInput(
  input: PostUnstableDashboardWidgetBodyType,
): PostUnstableDashboardWidgetBodyType {
  const { mappedFilters, unsupportedFilters } =
    partitionStoredUiTableFiltersToView(input.view, input.filters);
  const { allowedColumns, columnAliases } = getWidgetImportFilterConfig(
    input.view,
  );

  if (unsupportedFilters.length > 0) {
    throwInvalidWidget({
      message: `Unsupported filter column for view "${input.view}": ${unsupportedFilters.map((filter) => filter.column).join(", ")}`,
      field: "filters",
    });
  }

  const invalidFilterColumns = mappedFilters.flatMap((filter) => {
    const normalizedColumn = columnAliases[filter.column] ?? filter.column;
    return allowedColumns.has(normalizedColumn) ? [] : [filter.column];
  });

  if (invalidFilterColumns.length > 0) {
    throwInvalidWidget({
      message: `Unsupported filter column for view "${input.view}": ${invalidFilterColumns.join(", ")}`,
      field: "filters",
    });
  }

  return {
    ...input,
    filters: mappedFilters.map((filter) => ({
      ...filter,
      column: columnAliases[filter.column] ?? filter.column,
    })),
    minVersion: input.minVersion ?? 2,
  };
}

export function validatePublicDashboardWidgetInput(
  widget: PostUnstableDashboardWidgetBodyType,
): void {
  const viewVersion = getWidgetViewVersion(widget);
  const viewDeclaration = getPublicDashboardWidgetViewDeclaration(widget);

  for (const [index, dimension] of widget.dimensions.entries()) {
    const dimensionDefinition = viewDeclaration.dimensions[dimension.field];

    if (!dimensionDefinition) {
      throwInvalidWidget({
        message: `Dimension "${dimension.field}" is not available for view "${widget.view}" in version "${viewVersion}"`,
        field: `dimensions[${index}].field`,
        allowedValues: Object.keys(viewDeclaration.dimensions),
      });
    }

    if (dimensionDefinition.uiHidden) {
      throwInvalidWidget({
        message: `Dimension "${dimension.field}" is not available for widgets`,
        field: `dimensions[${index}].field`,
      });
    }
  }

  for (const [index, metric] of widget.metrics.entries()) {
    const measureDefinition = viewDeclaration.measures[metric.measure];

    if (!measureDefinition) {
      throwInvalidWidget({
        message: `Measure "${metric.measure}" is not available for view "${widget.view}" in version "${viewVersion}"`,
        field: `metrics[${index}].measure`,
        allowedValues: Object.keys(viewDeclaration.measures),
      });
    }

    const validAggregations = getValidAggregationsForMeasureType(
      measureDefinition.type,
    );

    if (!validAggregations.includes(metric.agg)) {
      throwInvalidWidget({
        message: `Aggregation "${metric.agg}" is not valid for measure "${metric.measure}"`,
        field: `metrics[${index}].agg`,
        allowedValues: validAggregations,
      });
    }
  }

  if (
    widget.chartType !== DashboardWidgetChartType.PIVOT_TABLE &&
    widget.dimensions.length > 1
  ) {
    throwInvalidWidget({
      message: "Only pivot table widgets can have multiple dimensions",
      field: "dimensions",
    });
  }

  if (
    widget.chartType === DashboardWidgetChartType.PIVOT_TABLE &&
    widget.dimensions.length > MAX_PIVOT_TABLE_DIMENSIONS
  ) {
    throwInvalidWidget({
      message: `Pivot table widgets can have at most ${MAX_PIVOT_TABLE_DIMENSIONS} dimensions`,
      field: "dimensions",
    });
  }

  if (
    widget.chartType === DashboardWidgetChartType.PIVOT_TABLE &&
    widget.metrics.length > MAX_PIVOT_TABLE_METRICS
  ) {
    throwInvalidWidget({
      message: `Pivot table widgets can have at most ${MAX_PIVOT_TABLE_METRICS} metrics`,
      field: "metrics",
    });
  }
}

export function toApiDashboardWidget(widget: WidgetDomain) {
  return PostUnstableDashboardWidgetResponse.parse({
    id: widget.id,
    createdAt: widget.createdAt,
    updatedAt: widget.updatedAt,
    name: widget.name,
    description: widget.description,
    view: reverseViewMapping[widget.view],
    dimensions: widget.dimensions,
    metrics: widget.metrics,
    filters: widget.filters,
    chartType: widget.chartType,
    chartConfig: widget.chartConfig,
    minVersion: widget.minVersion,
  });
}

export async function createPublicDashboardWidget(params: {
  projectId: string;
  input: PostUnstableDashboardWidgetBodyType;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const input = normalizePublicDashboardWidgetInput(params.input);
  validatePublicDashboardWidgetInput(input);

  const widget = await DashboardService.createWidget(params.projectId, {
    ...input,
    view: viewMapping[input.view],
  });

  await auditLog({
    action: "create",
    resourceType: "dashboardWidget",
    resourceId: widget.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    after: toApiDashboardWidget(widget),
  });

  return toApiDashboardWidget(widget);
}
