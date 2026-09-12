import type { DragEndEvent } from "@dnd-kit/core";

export function getProviderReorder(
  event: Pick<DragEndEvent, "active" | "over">,
  canReorder: boolean,
) {
  if (
    !canReorder ||
    !event.over ||
    event.active.id === event.over.id ||
    typeof event.active.id !== "string" ||
    typeof event.over.id !== "string"
  ) {
    return null;
  }

  return { sourceId: event.active.id, targetId: event.over.id };
}
