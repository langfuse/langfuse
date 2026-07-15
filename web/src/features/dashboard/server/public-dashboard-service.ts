import {
  DashboardService,
  type ApiAccessScope,
  type DashboardDomain,
} from "@langfuse/shared/src/server";
import { LangfuseConflictError, LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DashboardSchema } from "@/src/features/public-api/types/unstable-dashboards";
import type {
  DashboardPlacementSchema,
  PatchUnstableDashboardBody,
  PostUnstableDashboardBody,
} from "@/src/features/public-api/types/unstable-dashboards";
import type { z } from "zod";

type DashboardInput = z.infer<typeof PostUnstableDashboardBody>;
type DashboardPatch = z.infer<typeof PatchUnstableDashboardBody>;
type Placement = z.infer<typeof DashboardPlacementSchema>;

const toApiDashboard = (dashboard: DashboardDomain) =>
  DashboardSchema.parse({
    id: dashboard.id,
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
    name: dashboard.name,
    description: dashboard.description,
    definition: dashboard.definition,
    filters: dashboard.filters,
  });

async function getProjectDashboardOrThrow(
  projectId: string,
  dashboardId: string,
) {
  const dashboard = await DashboardService.getDashboard(dashboardId, projectId);
  if (!dashboard || dashboard.projectId !== projectId) {
    throw new LangfuseNotFoundError(`Dashboard ${dashboardId} not found`);
  }
  return dashboard;
}

async function assertPlacementReferences(params: {
  projectId: string;
  placements: Placement[];
}) {
  await Promise.all(
    params.placements.map(async (placement) => {
      if (placement.type !== "widget") return;
      const widget = await DashboardService.getWidget(
        placement.widgetId,
        params.projectId,
      );
      if (!widget || widget.projectId !== params.projectId) {
        throw new LangfuseNotFoundError(
          `Dashboard widget ${placement.widgetId} not found`,
        );
      }
    }),
  );
}

export async function listPublicDashboards(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const result = await DashboardService.listDashboards({
    ...params,
    includeLangfuseOwned: false,
  });
  return {
    data: result.dashboards.map(toApiDashboard),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems: result.totalCount,
      totalPages: Math.ceil(result.totalCount / params.limit),
    },
  };
}

export async function getPublicDashboard(params: {
  projectId: string;
  dashboardId: string;
}) {
  return toApiDashboard(
    await getProjectDashboardOrThrow(params.projectId, params.dashboardId),
  );
}

export async function createPublicDashboard(params: {
  projectId: string;
  input: DashboardInput;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  if (params.input.definition) {
    await assertPlacementReferences({
      projectId: params.projectId,
      placements: params.input.definition.widgets,
    });
  }
  const dashboard = await DashboardService.createDashboard(
    params.projectId,
    params.input.name,
    params.input.description,
    undefined,
    params.input.definition,
  );
  const updated = params.input.filters
    ? await DashboardService.updateDashboardFilters(
        dashboard.id,
        params.projectId,
        params.input.filters,
      )
    : dashboard;
  const result = toApiDashboard(updated);
  await auditLog({
    action: "create",
    resourceType: "dashboard",
    resourceId: dashboard.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    after: result,
  });
  return result;
}

export async function updatePublicDashboard(params: {
  projectId: string;
  dashboardId: string;
  input: DashboardPatch;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  if (params.input.definition) {
    await assertPlacementReferences({
      projectId: params.projectId,
      placements: params.input.definition.widgets,
    });
  }
  let dashboard = current;
  if (
    params.input.name !== undefined ||
    params.input.description !== undefined
  ) {
    dashboard = await DashboardService.updateDashboard(
      dashboard.id,
      params.projectId,
      params.input.name ?? dashboard.name,
      params.input.description ?? dashboard.description,
    );
  }
  if (params.input.definition !== undefined)
    dashboard = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      params.projectId,
      params.input.definition,
    );
  if (params.input.filters !== undefined)
    dashboard = await DashboardService.updateDashboardFilters(
      dashboard.id,
      params.projectId,
      params.input.filters,
    );
  const result = toApiDashboard(dashboard);
  await auditLog({
    action: "update",
    resourceType: "dashboard",
    resourceId: dashboard.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    before: toApiDashboard(current),
    after: result,
  });
  return result;
}

export async function deletePublicDashboard(params: {
  projectId: string;
  dashboardId: string;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  await DashboardService.deleteDashboard(params.dashboardId, params.projectId);
  await auditLog({
    action: "delete",
    resourceType: "dashboard",
    resourceId: current.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    before: toApiDashboard(current),
  });
}

export async function addPublicDashboardPlacement(params: {
  projectId: string;
  dashboardId: string;
  placement: Placement;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  if (
    current.definition.widgets.some(
      (placement) => placement.id === params.placement.id,
    )
  )
    throw new LangfuseConflictError(
      `Placement ${params.placement.id} already exists`,
    );
  return updatePublicDashboard({
    ...params,
    input: {
      definition: {
        widgets: [...current.definition.widgets, params.placement],
      },
    },
  });
}

export async function updatePublicDashboardPlacement(params: {
  projectId: string;
  dashboardId: string;
  placementId: string;
  placement: Placement;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  if (params.placement.id !== params.placementId)
    throw new LangfuseConflictError("Placement ID cannot be changed");
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  if (
    !current.definition.widgets.some(
      (placement) => placement.id === params.placementId,
    )
  )
    throw new LangfuseNotFoundError(
      `Placement ${params.placementId} not found`,
    );
  return updatePublicDashboard({
    ...params,
    input: {
      definition: {
        widgets: current.definition.widgets.map((placement) =>
          placement.id === params.placementId ? params.placement : placement,
        ),
      },
    },
  });
}

export async function deletePublicDashboardPlacement(params: {
  projectId: string;
  dashboardId: string;
  placementId: string;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  if (
    !current.definition.widgets.some(
      (placement) => placement.id === params.placementId,
    )
  )
    throw new LangfuseNotFoundError(
      `Placement ${params.placementId} not found`,
    );
  return updatePublicDashboard({
    ...params,
    input: {
      definition: {
        widgets: current.definition.widgets.filter(
          (placement) => placement.id !== params.placementId,
        ),
      },
    },
  });
}
