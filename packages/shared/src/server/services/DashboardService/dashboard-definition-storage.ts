import { isDeepStrictEqual } from "node:util";
import { Prisma, type Dashboard } from "@prisma/client";
import { prisma } from "../../../db";
import { LangfuseConflictError } from "../../../errors/ConflictError";
import { ForbiddenError } from "../../../errors/ForbiddenError";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import {
  DashboardDefinitionSchema,
  DashboardDefinitionV1Schema,
  savedDashboardBlockSchema,
  type DashboardBlockPatch,
  type DashboardDefinition,
  type SavedDashboardBlock,
} from "../../../features/dashboards";
import { DashboardDomainSchema, type DashboardDomain } from "./types";
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

function mirrorClassicPlacements({ widgets }: DashboardDefinition) {
  return { version: "1" as const, widgets, blocks: widgets };
}

export function newDashboardDefinition(initial: DashboardDefinition) {
  const classic = DashboardDefinitionSchema.parse(initial);
  return mirrorClassicPlacements(classic);
}

function interpretDashboardDefinition(
  raw: Prisma.JsonValue,
  classic: DashboardDefinition,
) {
  if (!isObject(raw)) return undefined;
  if (!("version" in raw) && !("blocks" in raw)) {
    return {
      needsUpgrade: true,
      definition: mirrorClassicPlacements(classic),
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
  return knownInlineBlocks(layout);
}

function readSavedBlock(entry: unknown) {
  return savedDashboardBlockSchema.safeParse(
    isObject(entry) && !("beforePlacementId" in entry)
      ? { ...entry, beforePlacementId: null }
      : entry,
  );
}

function knownInlineBlocks(
  layout: ReturnType<typeof interpretDashboardDefinition>,
): SavedDashboardBlock[] {
  if (!layout || layout.needsUpgrade) return [];
  const placements = new Set(layout.definition.widgets.map(({ id }) => id));
  return layout.definition.blocks.flatMap((entry) => {
    if (isClassicPlacement(entry)) return [];
    const block = readSavedBlock(entry);
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

export type PublicDashboard = Omit<DashboardDomain, "definition"> & {
  definition: DashboardDefinition | z.infer<typeof DashboardDefinitionV1Schema>;
};

export function toPublicDashboard(row: Dashboard): PublicDashboard {
  const classic = DashboardDomainSchema.parse({ ...row, owner: "PROJECT" });
  const layout = interpretDashboardDefinition(
    row.definition,
    classic.definition,
  );
  if (!layout) return { ...classic, definition: classic.definition };
  return {
    ...classic,
    definition: {
      version: "1" as const,
      widgets: classic.definition.widgets,
      blocks: layout.needsUpgrade
        ? classic.definition.widgets
        : [...classic.definition.widgets, ...knownInlineBlocks(layout)],
    },
  };
}

const dashboardColumns = Prisma.sql`id, project_id AS "projectId", name, description,
  filters, definition, created_at AS "createdAt", updated_at AS "updatedAt",
  created_by AS "createdBy", updated_by AS "updatedBy"`;

async function lockDashboard(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
) {
  // Both a classic layout save and a block patch decide against the latest contents of this row.
  const [dashboard] = await tx.$queryRaw<Dashboard[]>`
    SELECT ${dashboardColumns} FROM dashboards WHERE id = ${dashboardId} AND project_id = ${projectId} FOR UPDATE
  `;
  if (!dashboard) throw new LangfuseNotFoundError("Dashboard not found");
  return dashboard;
}

function editableLayout(raw: Prisma.JsonValue) {
  const layout = interpretDashboardDefinition(
    raw,
    DashboardDefinitionSchema.parse(raw),
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
  const [result] = await tx.$queryRaw<Dashboard[]>`
    UPDATE dashboards SET definition = ${updated}, updated_at = CURRENT_TIMESTAMP,
      updated_by = COALESCE(${userId ?? null}, updated_by)
    WHERE id = ${dashboardId} AND project_id = ${projectId}
    RETURNING ${dashboardColumns}
  `;
  return result;
}

export async function updateClassicLayout(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
  edit: (current: DashboardDefinition) => DashboardDefinition,
  userId?: string,
) {
  const row = await lockDashboard(tx, projectId, dashboardId);
  const current = editableLayout(row.definition);
  const result = await replaceClassicLayout(
    tx,
    projectId,
    dashboardId,
    current,
    edit({ widgets: current.definition.widgets }),
    userId,
  );
  return DashboardDomainSchema.parse({ ...result, owner: "PROJECT" });
}

function rawInlineIds(layout: ReturnType<typeof editableLayout>) {
  if (layout.needsUpgrade) return [];
  return layout.definition.blocks.flatMap((entry) =>
    !isClassicPlacement(entry) &&
    isObject(entry) &&
    typeof entry.id === "string"
      ? [entry.id]
      : [],
  );
}

async function replaceClassicLayout(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
  current: ReturnType<typeof editableLayout>,
  definition: DashboardDefinition,
  userId?: string,
) {
  const layout = DashboardDefinitionSchema.parse(definition);
  const inlineIds = new Set(rawInlineIds(current));
  if (layout.widgets.some(({ id }) => inlineIds.has(id)))
    throw new LangfuseConflictError(
      "Dashboard widget and placement IDs must be unique.",
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

export async function patchPublicDashboard(
  projectId: string,
  dashboardId: string,
  patch: {
    name?: string;
    description?: string;
    filters?: DashboardDomain["filters"];
    definition?: DashboardDefinition & {
      expectedInlineBlocks?: SavedDashboardBlock[];
    };
  },
) {
  return prisma.$transaction(async (tx) => {
    const current = await lockDashboard(tx, projectId, dashboardId);
    const before = toPublicDashboard(current);
    let result = current;
    if (patch.definition) {
      const layout = editableLayout(current.definition);
      const expected = patch.definition.expectedInlineBlocks;
      if (
        expected !== undefined &&
        !isDeepStrictEqual(expected, knownInlineBlocks(layout))
      ) {
        throw new ForbiddenError(
          "Saved Markdown and multi-query widgets are read-only through the public API.",
        );
      }
      result = await replaceClassicLayout(
        tx,
        projectId,
        dashboardId,
        layout,
        patch.definition,
      );
    }
    const { name, description, filters } = patch;
    if (
      name !== undefined ||
      description !== undefined ||
      filters !== undefined
    ) {
      result = await tx.dashboard.update({
        where: { id: dashboardId, projectId },
        data: { name, description, filters },
      });
    }
    return { before, after: toPublicDashboard(result) };
  });
}

export async function patchDashboardBlock(
  projectId: string,
  dashboardId: string,
  patch: DashboardBlockPatch,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const row = await lockDashboard(tx, projectId, dashboardId);
    const layout = editableLayout(row.definition);
    if (layout.definition.widgets.some(({ id }) => id === patch.id)) {
      throw new LangfuseConflictError(
        "Dashboard widget and placement IDs must be unique.",
      );
    }
    const entries = layout.definition.blocks;
    const matching = entries.flatMap((entry, index) =>
      !isClassicPlacement(entry) && isObject(entry) && entry.id === patch.id
        ? [index]
        : [],
    );
    if (matching.length > 1)
      throw new LangfuseConflictError(
        "The dashboard contains duplicate widget IDs.",
      );
    const index = matching[0];
    const current =
      index === undefined ? undefined : readSavedBlock(entries[index]);
    if (current === undefined && patch.expectedRevision !== 0)
      throw new LangfuseNotFoundError("Dashboard widget not found");
    if (
      current &&
      (!current.success ||
        current.data.revision !== patch.expectedRevision ||
        (patch.op === "upsert" && current.data.kind !== patch.kind))
    ) {
      throw new LangfuseConflictError(
        "This dashboard widget changed. Reload it and try again.",
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
    const result = await writeDefinition(
      tx,
      projectId,
      dashboardId,
      updated,
      userId,
    );
    return DashboardDomainSchema.parse({ ...result, owner: "PROJECT" });
  });
}
