import { z } from "zod";
import {
  dashboardBlockContentSchema,
  dashboardMarkdownConfigVersion,
  LangfuseConflictError,
  LangfuseNotFoundError,
  multiQueryConfigVersion,
  savedDashboardBlockSchema,
  type SavedDashboardBlock,
} from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { DashboardDefinitionSchema } from "@langfuse/shared/src/server";

const blockKinds = ["multiQuery", "markdown"] as const;

const dashboardBlockTargetSchema = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
});

export const getDashboardBlocksSchema = dashboardBlockTargetSchema.extend({
  kinds: z.array(z.enum(blockKinds)).optional(),
});

export const saveDashboardBlockSchema = dashboardBlockTargetSchema
  .extend({
    id: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    beforePlacementId: z.string().nullable().optional(),
  })
  .and(dashboardBlockContentSchema);

export const removeDashboardBlockSchema = dashboardBlockTargetSchema.extend({
  id: z.uuid(),
  expectedRevision: z.number().int().positive(),
});

const blockFields = {
  id: true,
  kind: true,
  config: true,
  revision: true,
  beforePlacementId: true,
} as const;
const blockWithDashboard = {
  ...blockFields,
  dashboard: { select: { definition: true } },
} as const;

/** The database checks the stored format in the same statement that edits or removes a block. */
function supportedFormat(
  kind: SavedDashboardBlock["kind"],
): Prisma.DashboardBlockWhereInput {
  switch (kind) {
    case "multiQuery":
      return {
        kind,
        config: { path: ["version"], equals: multiQueryConfigVersion },
      };
    case "markdown":
      return {
        kind,
        OR: [
          {
            config: {
              path: ["version"],
              equals: dashboardMarkdownConfigVersion,
            },
          },
          // Unversioned Markdown predates explicit formats. A JSON null is a distinct value.
          {
            AND: [
              { config: { path: ["version"], equals: Prisma.DbNull } },
              { config: { path: ["title"], string_contains: "" } },
              { config: { path: ["content"], string_contains: "" } },
            ],
          },
        ],
      };
  }
}

function placementIds(definition: Prisma.JsonValue) {
  return new Set(
    DashboardDefinitionSchema.parse(definition).widgets.map(({ id }) => id),
  );
}

function anchoredBlock<T extends { beforePlacementId: string | null }>(
  block: T,
  placements: Set<string>,
) {
  return {
    ...block,
    beforePlacementId:
      block.beforePlacementId !== null &&
      placements.has(block.beforePlacementId)
        ? block.beforePlacementId
        : null,
  };
}

export async function getDashboardBlocks({
  projectId,
  dashboardId,
  kinds: requestedKinds,
}: z.infer<typeof getDashboardBlocksSchema>): Promise<SavedDashboardBlock[]> {
  const kinds = requestedKinds ?? blockKinds;
  if (kinds.length === 0) return [];
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: dashboardId, OR: [{ projectId }, { projectId: null }] },
    select: {
      definition: true,
      blocks: {
        where: { dashboard: { projectId }, OR: kinds.map(supportedFormat) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: blockFields,
      },
    },
  });
  if (!dashboard) throw new LangfuseNotFoundError("Dashboard not found");
  const placements = placementIds(dashboard.definition);
  return dashboard.blocks.flatMap((block) => {
    // An older web server can encounter a newer block version during a rollback.
    const result = savedDashboardBlockSchema.safeParse(
      anchoredBlock(block, placements),
    );
    return result.success ? [result.data] : [];
  });
}

async function throwMissingOrStale(
  where: Prisma.DashboardBlockWhereInput,
): Promise<never> {
  const existing = await prisma.dashboardBlock.findFirst({
    where,
    select: { id: true },
  });
  if (existing)
    throw new LangfuseConflictError(
      "This dashboard block changed. Reload it and try again.",
    );
  throw new LangfuseNotFoundError("Dashboard block not found");
}

export async function saveDashboardBlock(
  input: z.infer<typeof saveDashboardBlockSchema>,
): Promise<SavedDashboardBlock> {
  const {
    projectId,
    dashboardId,
    id,
    kind,
    config,
    expectedRevision,
    beforePlacementId,
  } = input;
  const where = { dashboardId, id, dashboard: { projectId }, kind };
  try {
    const block =
      expectedRevision === 0
        ? await prisma.dashboardBlock.create({
            data: {
              dashboard: { connect: { id: dashboardId, projectId } },
              id,
              kind,
              config,
              beforePlacementId,
            },
            select: blockWithDashboard,
          })
        : await prisma.dashboardBlock.update({
            where: {
              dashboardId_id: { dashboardId, id },
              dashboard: { projectId },
              ...supportedFormat(kind),
              revision: expectedRevision,
            },
            data: {
              config,
              ...(beforePlacementId !== undefined && { beforePlacementId }),
              revision: { increment: 1 },
            },
            select: blockWithDashboard,
          });
    return savedDashboardBlockSchema.parse(
      anchoredBlock(block, placementIds(block.dashboard.definition)),
    );
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    if (error.code === "P2002") return throwMissingOrStale(where);
    if (error.code === "P2025" || error.code === "P2003") {
      if (expectedRevision === 0)
        throw new LangfuseNotFoundError("Dashboard not found");
      return throwMissingOrStale(where);
    }
    throw error;
  }
}

export async function removeDashboardBlock({
  projectId,
  dashboardId,
  id,
  expectedRevision,
}: z.infer<typeof removeDashboardBlockSchema>) {
  const where = {
    dashboardId,
    id,
    dashboard: { projectId },
  };
  const deleted = await prisma.dashboardBlock.deleteMany({
    where: {
      ...where,
      OR: blockKinds.map(supportedFormat),
      revision: expectedRevision,
    },
  });
  if (!deleted.count) return throwMissingOrStale(where);
  return { success: true as const };
}
