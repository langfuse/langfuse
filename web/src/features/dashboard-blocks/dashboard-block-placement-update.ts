import {
  savedDashboardBlockSchema,
  type SavedDashboardBlock,
  type DashboardBlockPatch,
} from "@langfuse/shared";

export function createDashboardBlockPlacementUpdate(
  block: SavedDashboardBlock,
  beforePlacementId: string | null,
): Extract<DashboardBlockPatch, { op: "upsert" }> | null {
  if (!savedDashboardBlockSchema.safeParse(block).success) return null;
  const placement = {
    id: block.id,
    expectedRevision: block.revision,
    beforePlacementId,
  };
  if (block.kind === "markdown")
    return {
      ...placement,
      op: "upsert",
      kind: "markdown",
      config: block.config,
    };
  return {
    ...placement,
    op: "upsert",
    kind: "multiQuery",
    config: block.config,
  };
}
