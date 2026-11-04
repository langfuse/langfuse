import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";

export type TraceCommentsPin = {
  traceId: string;
  selectedNodeId: string | null;
  target: CommentTarget;
  /** Once true, the panel follows the current selection instead of the URL object. */
  followsSelection: boolean;
};

function belongsToTrace(
  target: CommentTarget,
  traceId: string,
  observationIds: ReadonlySet<string>,
) {
  if (target.objectType === "TRACE") return target.objectId === traceId;
  if (target.objectType === "OBSERVATION")
    return observationIds.has(target.objectId);
  return false;
}

function selectionIsResolved(
  selectedNodeId: string | null,
  traceId: string,
  traceNodeId: string,
  observationIds: ReadonlySet<string>,
) {
  return (
    selectedNodeId == null ||
    selectedNodeId === traceId ||
    selectedNodeId === traceNodeId ||
    observationIds.has(selectedNodeId)
  );
}

/**
 * The open comments panel is pinned to its URL object so a deep link can show
 * that object's thread. After the selected trace or observation changes, the
 * panel follows the selection instead of the object id left in the URL.
 */
export function resolveTraceCommentsTarget(input: {
  active: boolean;
  traceId: string;
  traceNodeId: string;
  observationIds: readonly string[];
  selectedNodeId: string | null;
  selectionTarget: CommentTarget;
  sessionTarget?: CommentTarget;
  urlTarget?: CommentTarget;
  pin: TraceCommentsPin | null;
}): { target: CommentTarget; pin: TraceCommentsPin | null } {
  if (!input.active) {
    return {
      target: input.sessionTarget ?? input.urlTarget ?? input.selectionTarget,
      pin: input.pin,
    };
  }

  const observationIds = new Set(input.observationIds);
  const resolved = selectionIsResolved(
    input.selectedNodeId,
    input.traceId,
    input.traceNodeId,
    observationIds,
  );
  const urlTarget =
    input.urlTarget &&
    belongsToTrace(input.urlTarget, input.traceId, observationIds)
      ? input.urlTarget
      : undefined;
  const sessionMatchesSelection =
    resolved &&
    input.sessionTarget?.objectId === input.selectionTarget.objectId &&
    input.sessionTarget.objectType === input.selectionTarget.objectType
      ? input.sessionTarget
      : undefined;

  let pin = input.pin;
  if (!pin || pin.traceId !== input.traceId) {
    pin = {
      traceId: input.traceId,
      selectedNodeId: input.selectedNodeId,
      target: sessionMatchesSelection ?? urlTarget ?? input.selectionTarget,
      followsSelection: !resolved,
    };
  } else if (
    !pin.followsSelection &&
    resolved &&
    input.selectedNodeId !== pin.selectedNodeId
  ) {
    pin = { ...pin, followsSelection: true };
  }

  return {
    target:
      pin.followsSelection && resolved ? input.selectionTarget : pin.target,
    pin,
  };
}
