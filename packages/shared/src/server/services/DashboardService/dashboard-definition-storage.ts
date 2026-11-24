import { prisma, Prisma } from "../../../db";
import { LangfuseConflictError } from "../../../errors/ConflictError";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import {
  savedDashboardBlockSchema,
  type DashboardBlockPatch,
  type SavedDashboardBlock,
} from "../../../domain/dashboard-block";
import {
  DashboardDefinitionSchema,
  DashboardDefinitionV1Schema,
  DashboardDomainSchema,
  type DashboardDefinition,
} from "./types";
import { z } from "zod";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isClassicPlacement(value: unknown) {
  return (
    isObject(value) &&
    !("kind" in value) &&
    (value.type === "widget" || value.type === "preset")
  );
}

// Read the envelope even if a newer client added an inline kind or config version.
const storedVersionOneEnvelope = DashboardDefinitionV1Schema.pick({
  version: true,
}).extend({
  blocks: z.array(z.unknown()),
});

function interpretDashboardDefinition(
  raw: Prisma.JsonValue,
  classic: DashboardDefinition,
) {
  if (!isObject(raw)) return undefined;
  if (!("version" in raw) && !("blocks" in raw)) {
    return {
      needsUpgrade: true,
      definition: {
        version: "1" as const,
        widgets: classic.widgets,
        blocks: classic.widgets,
      },
    };
  }
  const envelope = storedVersionOneEnvelope.safeParse(raw);
  return envelope.success
    ? {
        needsUpgrade: false,
        definition: { ...envelope.data, widgets: classic.widgets },
      }
    : undefined;
}

export function hasDashboardBlocks(
  raw: Prisma.JsonValue,
  classic: DashboardDefinition,
) {
  const layout = interpretDashboardDefinition(raw, classic);
  return Boolean(
    layout &&
    !layout.needsUpgrade &&
    layout.definition.blocks.some((entry) => !isClassicPlacement(entry)),
  );
}

export async function getDashboardBlocks(
  projectId: string,
  dashboardId: string,
): Promise<SavedDashboardBlock[]> {
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: dashboardId, OR: [{ projectId }, { projectId: null }] },
    select: { definition: true, projectId: true },
  });
  if (!dashboard) throw new LangfuseNotFoundError("Dashboard not found");
  if (!dashboard.projectId) return [];
  const layout = interpretDashboardDefinition(
    dashboard.definition,
    DashboardDefinitionSchema.parse(dashboard.definition),
  );
  if (!layout || layout.needsUpgrade) return [];
  const placements = new Set(layout.definition.widgets.map(({ id }) => id));
  return layout.definition.blocks.flatMap((entry) => {
    if (isClassicPlacement(entry)) return [];
    const block = savedDashboardBlockSchema.safeParse(entry);
    if (!block.success) return [];
    const anchor = block.data.beforePlacementId;
    return [
      {
        ...block.data,
        beforePlacementId:
          anchor !== null && placements.has(anchor) ? anchor : null,
      },
    ];
  });
}

async function lockDefinition(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
) {
  // Both a classic layout save and a block patch decide against the latest contents of this row.
  const [dashboard] = await tx.$queryRaw<{ definition: Prisma.JsonValue }[]>`
    SELECT definition FROM dashboards WHERE id = ${dashboardId} AND project_id = ${projectId} FOR UPDATE
  `;
  if (!dashboard) throw new LangfuseNotFoundError("Dashboard not found");
  const layout = interpretDashboardDefinition(
    dashboard.definition,
    DashboardDefinitionSchema.parse(dashboard.definition),
  );
  if (!layout)
    throw new LangfuseConflictError(
      "This dashboard definition version cannot be edited.",
    );
  return layout;
}

async function writeDefinition(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
  updated: Prisma.Sql,
  userId?: string,
) {
  await tx.$executeRaw`
    UPDATE dashboards SET definition = ${updated}, updated_at = CURRENT_TIMESTAMP,
      updated_by = COALESCE(${userId ?? null}, updated_by)
    WHERE id = ${dashboardId} AND project_id = ${projectId}
  `;
  const result = await tx.dashboard.findFirstOrThrow({
    where: { id: dashboardId, projectId },
  });
  return DashboardDomainSchema.parse({ ...result, owner: "PROJECT" });
}

export async function updateClassicLayout(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
  edit: (current: DashboardDefinition) => DashboardDefinition,
  userId?: string,
) {
  const current = await lockDefinition(tx, projectId, dashboardId);
  const layout = DashboardDefinitionSchema.parse(
    edit({ widgets: current.definition.widgets }),
  );
  const classic = Prisma.sql`${JSON.stringify(layout)}::jsonb`;

  // Rebuild only the classic part, without decoding other entries through JavaScript.
  const updated = Prisma.sql`(SELECT definition || grid || jsonb_build_object('version', '1', 'blocks', (grid->'widgets') || COALESCE((
      SELECT jsonb_agg(entry ORDER BY ord)
      FROM jsonb_array_elements(definition->'blocks') WITH ORDINALITY AS stored(entry, ord)
      WHERE (entry->>'type' IN ('widget', 'preset') AND NOT (entry ? 'kind')) IS NOT TRUE
    ), '[]'::jsonb)) FROM (SELECT ${classic} AS grid) AS layout)`;
  return writeDefinition(tx, projectId, dashboardId, updated, userId);
}

export async function patchDashboardBlock(
  projectId: string,
  dashboardId: string,
  patch: DashboardBlockPatch,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const layout = await lockDefinition(tx, projectId, dashboardId);
    const entries = layout.definition.blocks;
    const matching = entries.flatMap((entry, index) =>
      !isClassicPlacement(entry) && isObject(entry) && entry.id === patch.id
        ? [index]
        : [],
    );
    if (matching.length > 1)
      throw new LangfuseConflictError(
        "The dashboard contains duplicate block IDs.",
      );
    const index = matching[0];
    const current =
      index === undefined
        ? undefined
        : savedDashboardBlockSchema.safeParse(entries[index]);
    if (current === undefined && patch.expectedRevision !== 0)
      throw new LangfuseNotFoundError("Dashboard block not found");
    if (
      current &&
      (!current.success ||
        current.data.revision !== patch.expectedRevision ||
        (patch.op === "upsert" && current.data.kind !== patch.kind))
    ) {
      throw new LangfuseConflictError(
        "This dashboard block changed. Reload it and try again.",
      );
    }

    const path = Prisma.sql`ARRAY['blocks', ${String(index ?? entries.length)}]`;
    const base = layout.needsUpgrade
      ? Prisma.sql`definition || jsonb_build_object('version', '1', 'blocks', definition->'widgets')`
      : Prisma.sql`definition`;
    let updated: Prisma.Sql;
    if (patch.op === "remove") {
      updated = Prisma.sql`definition #- ${path}`;
    } else {
      const next = {
        id: patch.id,
        kind: patch.kind,
        config: patch.config,
        revision: patch.expectedRevision + 1,
        beforePlacementId:
          patch.beforePlacementId === undefined
            ? (current?.data?.beforePlacementId ?? null)
            : patch.beforePlacementId,
      };
      updated = Prisma.sql`jsonb_set(${base}, ${path}, ${JSON.stringify(next)}::jsonb)`;
    }
    return writeDefinition(tx, projectId, dashboardId, updated, userId);
  });
}
