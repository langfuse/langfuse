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
  type DashboardWidgetViewOutputType,
  type PostUnstableDashboardWidgetBodyType,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { ChartConfigSchema, LangfuseNotFoundError } from "@langfuse/shared";
import {
  getWidgetImportFilterConfig,
  partitionStoredUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";

// The widget shape used internally after input normalization: the public
// body with chartConfig fully resolved plus the internal minVersion.
type NormalizedWidgetInput = Omit<
  z.infer<typeof PostUnstableDashboardWidgetResponse>,
  "id" | "createdAt" | "updatedAt"
> & { minVersion: number };

const viewMapping: Record<DashboardWidgetViewOutputType, DashboardWidgetViews> =
  {
    observations: DashboardWidgetViews.OBSERVATIONS,
    "scores-numeric": DashboardWidgetViews.SCORES_NUMERIC,
    "scores-categorical": DashboardWidgetViews.SCORES_CATEGORICAL,
    traces: DashboardWidgetViews.TRACES,
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

function getWidgetViewVersion(widget: { minVersion: number }): ViewVersion {
  return widget.minVersion >= 2 ? "v2" : "v1";
}

function getPublicDashboardWidgetViewDeclaration(
  widget: NormalizedWidgetInput,
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

type PublicDashboardWidgetInput = Omit<
  PostUnstableDashboardWidgetBodyType,
  "view"
> & { view: DashboardWidgetViewOutputType };

export function normalizePublicDashboardWidgetInput(
  input: PublicDashboardWidgetInput,
  minVersion = 2,
): NormalizedWidgetInput {
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

  // chartConfig.type defaults to chartType; when given explicitly it must
  // match. Per-type option validation happens after the type is resolved.
  const chartConfigType = input.chartConfig?.type ?? input.chartType;
  if (chartConfigType !== input.chartType) {
    throwInvalidWidget({
      message: "chartConfig.type must match chartType",
      field: "chartConfig.type",
    });
  }
  const chartConfig = ChartConfigSchema.safeParse({
    ...input.chartConfig,
    type: chartConfigType,
  });
  if (!chartConfig.success) {
    return throwInvalidWidget({
      message: `Invalid chartConfig: ${chartConfig.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ")}`,
      field: "chartConfig",
    });
  }

  return {
    ...input,
    filters: mappedFilters.map((filter) => ({
      ...filter,
      column: columnAliases[filter.column] ?? filter.column,
    })),
    chartConfig: chartConfig.data,
    minVersion,
  };
}

export function validatePublicDashboardWidgetInput(
  widget: NormalizedWidgetInput,
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

function toPublicWidgetInput(widget: WidgetDomain) {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...input
  } = toApiDashboardWidget(widget);
  return input;
}

async function getProjectWidgetOrThrow(projectId: string, widgetId: string) {
  const widget = await DashboardService.getWidget(widgetId, projectId);
  if (!widget || widget.projectId !== projectId) {
    throw new LangfuseNotFoundError(`Dashboard widget ${widgetId} not found`);
  }
  return widget;
}

export async function listPublicDashboardWidgets(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const result = await DashboardService.listWidgets(params);
  return {
    data: result.widgets.map(toApiDashboardWidget),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems: result.totalCount,
      totalPages: Math.ceil(result.totalCount / params.limit),
    },
  };
}

export async function getPublicDashboardWidget(params: {
  projectId: string;
  widgetId: string;
}) {
  return toApiDashboardWidget(
    await getProjectWidgetOrThrow(params.projectId, params.widgetId),
  );
}

export async function updatePublicDashboardWidget(params: {
  projectId: string;
  widgetId: string;
  input: Partial<PostUnstableDashboardWidgetBodyType>;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectWidgetOrThrow(
    params.projectId,
    params.widgetId,
  );
  const currentPublic = toPublicWidgetInput(current);
  const chartTypeChanged =
    params.input.chartType !== undefined &&
    params.input.chartType !== currentPublic.chartType;
  // Keep the stored minVersion (and thus v1/v2 query semantics) unless the
  // caller explicitly changes the view; view changes land on v2 like create.
  const mergedView = params.input.view ?? currentPublic.view;
  const minVersion = mergedView === currentPublic.view ? current.minVersion : 2;
  const input = normalizePublicDashboardWidgetInput(
    {
      ...currentPublic,
      ...params.input,
      // A chartType change without an explicit chartConfig resets the config
      // to the new type; carrying the stale config type over would always
      // fail validation.
      chartConfig:
        params.input.chartConfig ??
        (chartTypeChanged
          ? { type: params.input.chartType }
          : currentPublic.chartConfig),
    },
    minVersion,
  );
  validatePublicDashboardWidgetInput(input);
  const updated = await DashboardService.updateWidget(
    params.projectId,
    params.widgetId,
    { ...input, view: viewMapping[input.view] },
  );
  const result = toApiDashboardWidget(updated);
  await auditLog({
    action: "update",
    resourceType: "dashboardWidget",
    resourceId: updated.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    before: toApiDashboardWidget(current),
    after: result,
  });
  return result;
}

export async function deletePublicDashboardWidget(params: {
  projectId: string;
  widgetId: string;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectWidgetOrThrow(
    params.projectId,
    params.widgetId,
  );
  await DashboardService.deleteWidget(params.widgetId, params.projectId);
  await auditLog({
    action: "delete",
    resourceType: "dashboardWidget",
    resourceId: current.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    before: toApiDashboardWidget(current),
  });
}
