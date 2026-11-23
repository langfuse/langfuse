import {
  savedDashboardBlockSchema,
  type SavedDashboardBlock,
} from "@langfuse/shared";

export function createDashboardBlockPlacementUpdate(
  block: SavedDashboardBlock,
  beforePlacementId: string | null,
) {
  if (!savedDashboardBlockSchema.safeParse(block).success) return null;
  const placement = {
    id: block.id,
    expectedRevision: block.revision,
    beforePlacementId,
  };
  if (block.kind === "markdown")
    return { ...placement, kind: "markdown" as const, config: block.config };
  return { ...placement, kind: "multiQuery" as const, config: block.config };
}
