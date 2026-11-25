import { isDeepStrictEqual } from "node:util";
import { Prisma, type Dashboard } from "@prisma/client";
import { prisma } from "../../../db";
import { LangfuseConflictError } from "../../../errors/ConflictError";
import { ForbiddenError } from "../../../errors/ForbiddenError";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import {
  DashboardDefinitionSchema,
  DashboardDefinitionV1Schema,
  storedInlineDashboardWidgetSchema,
  type DashboardBlockPatch,
  type DashboardDefinition,
  type SavedDashboardBlock,
  type StoredInlineDashboardWidget,
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
  includeConvertedPresets = false,
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
  return knownInlineBlocks(layout).flatMap<SavedDashboardBlock>((entry) => {
    if (entry.kind !== "convertedPreset") return [entry];
    return includeConvertedPresets ? [{ ...entry, kind: "multiQuery" }] : [];
  });
}

function readSavedBlock(entry: unknown) {
  return storedInlineDashboardWidgetSchema.safeParse(
    isObject(entry) && !("beforePlacementId" in entry)
      ? { ...entry, beforePlacementId: null }
      : entry,
  );
}

function indexPlacements(entries: readonly unknown[]) {
  const positions = new Map<
    string,
    { index: number; presetId: unknown } | null
  >();
  entries.forEach((entry, index) => {
    if (!isObject(entry) || typeof entry.id !== "string") return;
    // A legacy document may contain duplicate IDs. It has no unambiguous replacement slot.
    const presetId =
      isClassicPlacement(entry) && entry.type === "preset"
        ? entry.presetId
        : undefined;
    positions.set(
      entry.id,
      positions.has(entry.id) ? null : { index, presetId },
    );
  });
  return positions;
}

function boundPresetIndex(
  positions: ReturnType<typeof indexPlacements>,
  source: { placementId: string; presetId: string },
) {
  const placement = positions.get(source.placementId);
  return placement?.presetId === source.presetId ? placement.index : undefined;
}

// Preserve bindings even when this binary cannot interpret a newer chart configuration.
function storedPresetSource(entry: unknown) {
  if (
    !isObject(entry) ||
    entry.kind !== "convertedPreset" ||
    !isObject(entry.sourcePreset)
  )
    return;
  const { placementId, presetId } = entry.sourcePreset;
  if (typeof placementId === "string" && typeof presetId === "string")
    return { placementId, presetId };
}

function knownInlineBlocks(
  layout: ReturnType<typeof interpretDashboardDefinition>,
  echoedPlacementIds?: ReadonlySet<string>,
): StoredInlineDashboardWidget[] {
  if (!layout || layout.needsUpgrade) return [];
  const placements = indexPlacements(layout.definition.widgets);
  const anchorIds = echoedPlacementIds ?? placements;
  return layout.definition.blocks.flatMap<StoredInlineDashboardWidget>(
    (entry) => {
      if (isClassicPlacement(entry)) return [];
      const block = readSavedBlock(entry);
      if (!block.success) return [];
      const saved = block.data;
      if (saved.kind === "convertedPreset") {
        return boundPresetIndex(placements, saved.sourcePreset) !== undefined
          ? [saved]
          : [];
      }
      const anchor = saved.beforePlacementId;
      return [
        {
          ...saved,
          beforePlacementId:
            anchor !== null && anchorIds.has(anchor) ? anchor : null,
        },
      ];
    },
  );
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
  const previous = indexPlacements(current.definition.widgets);
  const next = indexPlacements(layout.widgets);
  for (const entry of current.definition.blocks) {
    const source = storedPresetSource(entry);
    if (
      source &&
      boundPresetIndex(previous, source) !== undefined &&
      boundPresetIndex(next, source) === undefined
    )
      throw new LangfuseConflictError(
        "Restore or remove the converted widget before removing its preset placement.",
      );
  }
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
      blocks?: z.infer<typeof DashboardDefinitionV1Schema>["blocks"];
    };
  },
) {
  return prisma.$transaction(async (tx) => {
    const current = await lockDashboard(tx, projectId, dashboardId);
    const before = toPublicDashboard(current);
    let result = current;
    if (patch.definition) {
      const layout = editableLayout(current.definition);
      const { widgets, blocks } = patch.definition;
      if (blocks) {
        const expected = blocks.filter((block) => "kind" in block);
        const saved =
          "blocks" in before.definition
            ? before.definition.blocks.filter((block) => "kind" in block)
            : [];
        const echoedGrid = blocks.filter((block) => "type" in block);
        // Changing the classic grid can hide or reveal an anchor without revising its inline widget.
        const projectedOnEchoedGrid = knownInlineBlocks(
          layout,
          new Set(echoedGrid.map(({ id }) => id)),
        );
        if (
          expected.length !== saved.length ||
          expected.some((block, index) => {
            const stored = saved[index];
            return (
              block.id !== stored.id ||
              block.kind !== stored.kind ||
              (block.revision >= stored.revision &&
                !isDeepStrictEqual(block, stored) &&
                !isDeepStrictEqual(block, projectedOnEchoedGrid[index]))
            );
          })
        )
          throw new ForbiddenError(
            "Saved Markdown and multi-query widgets are read-only through the public API.",
          );
        if (!isDeepStrictEqual(expected, saved))
          throw new LangfuseConflictError(
            "Saved dashboard widgets changed. Reload the dashboard and try again.",
          );
        // An older client may edit widgets on the response object and echo blocks.
        // The echoed blocks must still describe the layout locked by this transaction.
        if (
          !isDeepStrictEqual(widgets, echoedGrid) &&
          !(
            "blocks" in before.definition &&
            isDeepStrictEqual(blocks, before.definition.blocks)
          )
        )
          throw new LangfuseConflictError(
            "The dashboard layout changed. Reload the dashboard and try again.",
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
  { canAuthorWidgets, userId }: { canAuthorWidgets: boolean; userId?: string },
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
    // A dashboard editor can remove a classic placement even after its Home card is converted.
    if (
      !canAuthorWidgets &&
      !(
        patch.op === "remove" &&
        current?.success &&
        current.data.kind === "convertedPreset"
      )
    )
      throw new ForbiddenError(
        "Dashboard widget authoring requires the employee feature preview.",
      );
    const conflict = () =>
      new LangfuseConflictError(
        "This dashboard widget changed. Reload it and try again.",
      );
    if (current === undefined && patch.expectedRevision !== 0)
      throw new LangfuseNotFoundError("Dashboard widget not found");
    if (
      current &&
      (!current.success || current.data.revision !== patch.expectedRevision)
    )
      throw conflict();
    const saved = current?.data;
    const path = Prisma.sql`ARRAY['blocks', ${String(index ?? entries.length)}]`;
    const base = layout.needsUpgrade
      ? Prisma.sql`definition || jsonb_build_object('version', '1', 'blocks', definition->'widgets')`
      : Prisma.sql`definition`;
    // A replacement is bound to the same unique preset in both representations of the grid.
    const source =
      patch.op === "convertPreset"
        ? patch.sourcePreset
        : storedPresetSource(saved);
    const gridIndex =
      source &&
      boundPresetIndex(indexPlacements(layout.definition.widgets), source);
    const entryIndex =
      source && boundPresetIndex(indexPlacements(entries), source);
    if (source && (gridIndex === undefined || entryIndex === undefined))
      throw conflict();
    let updated: Prisma.Sql;
    if (patch.op === "convertPreset") {
      if (
        entries.some(
          (entry) =>
            storedPresetSource(entry)?.placementId ===
            patch.sourcePreset.placementId,
        )
      )
        throw conflict();
      const replacement = {
        kind: "convertedPreset",
        id: patch.id,
        revision: 1,
        beforePlacementId: null,
        sourcePreset: patch.sourcePreset,
        config: patch.config,
      };
      updated = Prisma.sql`jsonb_set(${base}, ${path}, ${JSON.stringify(replacement)}::jsonb)`;
    } else if (patch.op === "restorePreset") {
      if (saved?.kind !== "convertedPreset") throw conflict();
      updated = Prisma.sql`definition #- ${path}`;
    } else if (patch.op === "remove") {
      updated = Prisma.sql`definition #- ${path}`;
      if (saved?.kind === "convertedPreset") {
        if (
          gridIndex === undefined ||
          entryIndex === undefined ||
          index === undefined
        )
          throw conflict();
        // Array positions shift when an item is removed. Remove the later one first.
        updated = Prisma.sql`definition #- ARRAY['widgets', ${String(gridIndex)}]
          #- ARRAY['blocks', ${String(Math.max(index, entryIndex))}] #- ARRAY['blocks', ${String(Math.min(index, entryIndex))}]`;
      }
    } else {
      if (saved?.kind === "convertedPreset") {
        if (
          patch.kind !== "multiQuery" ||
          patch.config.version !== 2 ||
          patch.beforePlacementId != null
        )
          throw conflict();
      } else if (saved && saved.kind !== patch.kind) throw conflict();
      const next = {
        id: patch.id,
        kind: saved?.kind ?? patch.kind,
        ...(saved?.kind === "convertedPreset"
          ? { sourcePreset: saved.sourcePreset }
          : {}),
        config: patch.config,
        revision: patch.expectedRevision + 1,
        beforePlacementId:
          patch.beforePlacementId === undefined
            ? (saved?.beforePlacementId ?? null)
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
