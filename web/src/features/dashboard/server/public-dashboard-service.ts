import {
  DashboardService,
  type ApiAccessScope,
  type DashboardDomain,
} from "@langfuse/shared/src/server";
import {
  HOME_DASHBOARD_PRESET_IDS,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DashboardSchema } from "@/src/features/public-api/types/unstable-dashboards";
import type {
  DashboardPlacementSchema,
  PatchDashboardPlacementBody,
  PatchUnstableDashboardBody,
  PostDashboardPlacementBody,
  PostUnstableDashboardBody,
} from "@/src/features/public-api/types/unstable-dashboards";
import type { z } from "zod";
import { randomUUID } from "crypto";

type DashboardInput = z.infer<typeof PostUnstableDashboardBody>;
type DashboardPatch = z.infer<typeof PatchUnstableDashboardBody>;
type PublicPlacement = z.infer<typeof DashboardPlacementSchema>;
type PlacementCreate = z.infer<typeof PostDashboardPlacementBody>;
type PlacementPatch = z.infer<typeof PatchDashboardPlacementBody>;
type InternalPlacement = DashboardDomain["definition"]["widgets"][number];

// Matches the UI's add-widget default: a half-width (12-column grid) 6x6
// tile appended below all existing tiles.
const PLACEMENT_DEFAULT_SIZE = 6;

// The public contract exposes placement sizes as width/height; storage and
// the UI keep x_size/y_size.
const toPublicPlacement = (placement: InternalPlacement): PublicPlacement =>
  placement.type === "widget"
    ? {
        type: "widget",
        id: placement.id,
        widgetId: placement.widgetId,
        x: placement.x,
        y: placement.y,
        width: placement.x_size,
        height: placement.y_size,
      }
    : {
        type: "preset",
        id: placement.id,
        presetId: placement.presetId,
        x: placement.x,
        y: placement.y,
        width: placement.x_size,
        height: placement.y_size,
      };

const toInternalPlacement = (placement: PublicPlacement): InternalPlacement =>
  placement.type === "widget"
    ? {
        type: "widget",
        id: placement.id,
        widgetId: placement.widgetId,
        x: placement.x,
        y: placement.y,
        x_size: placement.width,
        y_size: placement.height,
      }
    : {
        type: "preset",
        id: placement.id,
        presetId: placement.presetId,
        x: placement.x,
        y: placement.y,
        x_size: placement.width,
        y_size: placement.height,
      };

const toApiDashboard = (dashboard: DashboardDomain) =>
  DashboardSchema.parse({
    id: dashboard.id,
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
    name: dashboard.name,
    description: dashboard.description,
    definition: {
      widgets: dashboard.definition.widgets.map(toPublicPlacement),
    },
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
  placements: InternalPlacement[];
}) {
  await Promise.all(
    params.placements.map(async (placement) => {
      if (placement.type === "preset") {
        if (
          !(HOME_DASHBOARD_PRESET_IDS as readonly string[]).includes(
            placement.presetId,
          )
        ) {
          throw new LangfuseNotFoundError(
            `Dashboard preset ${placement.presetId} not found`,
          );
        }
        return;
      }
      // getWidget resolves project-owned and Langfuse-managed (projectId
      // null) widgets; both are placeable, matching the UI.
      const widget = await DashboardService.getWidget(
        placement.widgetId,
        params.projectId,
      );
      if (!widget) {
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
  const definition = params.input.definition
    ? { widgets: params.input.definition.widgets.map(toInternalPlacement) }
    : undefined;
  if (definition) {
    await assertPlacementReferences({
      projectId: params.projectId,
      placements: definition.widgets,
    });
  }
  const dashboard = await DashboardService.createDashboard(
    params.projectId,
    params.input.name,
    params.input.description,
    undefined,
    definition,
    params.input.filters,
  );
  const result = toApiDashboard(dashboard);
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
  const definition = params.input.definition
    ? { widgets: params.input.definition.widgets.map(toInternalPlacement) }
    : undefined;
  if (definition) {
    await assertPlacementReferences({
      projectId: params.projectId,
      placements: definition.widgets,
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
  if (definition !== undefined)
    dashboard = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      params.projectId,
      definition,
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

// Shared write path for single-placement mutations. Unlike the full-definition
// PATCH, callers validate only the placements they actually add or change.
async function writeDashboardDefinition(params: {
  projectId: string;
  current: DashboardDomain;
  widgets: InternalPlacement[];
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const dashboard = await DashboardService.updateDashboardDefinition(
    params.current.id,
    params.projectId,
    { widgets: params.widgets },
  );
  await auditLog({
    action: "update",
    resourceType: "dashboard",
    resourceId: dashboard.id,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
    before: toApiDashboard(params.current),
    after: toApiDashboard(dashboard),
  });
  return dashboard;
}

export async function addPublicDashboardPlacement(params: {
  projectId: string;
  dashboardId: string;
  placement: PlacementCreate;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  const maxY =
    current.definition.widgets.length > 0
      ? Math.max(
          ...current.definition.widgets.map(
            (placement) => placement.y + placement.y_size,
          ),
        )
      : 0;
  const placement: PublicPlacement = {
    ...params.placement,
    id: params.placement.id ?? randomUUID(),
    x: params.placement.x ?? 0,
    y: params.placement.y ?? maxY,
    width: params.placement.width ?? PLACEMENT_DEFAULT_SIZE,
    height: params.placement.height ?? PLACEMENT_DEFAULT_SIZE,
  };
  if (
    current.definition.widgets.some((existing) => existing.id === placement.id)
  )
    throw new LangfuseConflictError(`Placement ${placement.id} already exists`);
  const internalPlacement = toInternalPlacement(placement);
  // Existing placements were validated when they were added; only the new
  // placement's reference needs checking.
  await assertPlacementReferences({
    projectId: params.projectId,
    placements: [internalPlacement],
  });
  await writeDashboardDefinition({
    projectId: params.projectId,
    current,
    widgets: [...current.definition.widgets, internalPlacement],
    auditScope: params.auditScope,
  });
  return placement;
}

export async function updatePublicDashboardPlacement(params: {
  projectId: string;
  dashboardId: string;
  placementId: string;
  placement: PlacementPatch;
  auditScope: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const current = await getProjectDashboardOrThrow(
    params.projectId,
    params.dashboardId,
  );
  const existing = current.definition.widgets.find(
    (placement) => placement.id === params.placementId,
  );
  if (!existing)
    throw new LangfuseNotFoundError(
      `Placement ${params.placementId} not found`,
    );
  // Pure move/resize: the placement's content is immutable, so no reference
  // re-validation is needed.
  const updated: InternalPlacement = {
    ...existing,
    x: params.placement.x ?? existing.x,
    y: params.placement.y ?? existing.y,
    x_size: params.placement.width ?? existing.x_size,
    y_size: params.placement.height ?? existing.y_size,
  };
  await writeDashboardDefinition({
    projectId: params.projectId,
    current,
    widgets: current.definition.widgets.map((placement) =>
      placement.id === params.placementId ? updated : placement,
    ),
    auditScope: params.auditScope,
  });
  return toPublicPlacement(updated);
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
  await writeDashboardDefinition({
    projectId: params.projectId,
    current,
    widgets: current.definition.widgets.filter(
      (placement) => placement.id !== params.placementId,
    ),
    auditScope: params.auditScope,
  });
  return { message: "Placement successfully deleted" as const };
}
