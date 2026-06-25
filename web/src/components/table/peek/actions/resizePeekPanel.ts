import { type PointerEvent as ReactPointerEvent } from "react";
import {
  PEEK_FULLSCREEN_ENTER_FRACTION,
  type PeekPanelStore,
} from "@/src/components/table/peek/store/peekPanelStore";

/** Viewport fraction to the RIGHT of the pointer (the panel is docked right). */
function widthFractionFromClientX(clientX: number): number {
  return 1 - clientX / window.innerWidth;
}

/**
 * Drag workflow for the left-edge resize handle. Attaches window pointer
 * listeners, drives the store through its `actions`, and commits the width on
 * pointer-up. Dragging past {@link PEEK_FULLSCREEN_ENTER_FRACTION} enters
 * fullscreen (without persisting a width).
 *
 * Not a hook — it takes the store instance directly (per the local-feature
 * state pattern). Returns a teardown that ends an in-flight drag; the caller
 * also runs it on unmount so a drag interrupted by the peek closing can't leak
 * listeners or leave the body cursor/selection styles applied.
 */
export function beginPeekResize(
  store: PeekPanelStore,
  event: ReactPointerEvent,
): () => void {
  // Only primary-button drags; the keyboard path handles the rest.
  if (event.button !== 0) return () => {};
  event.preventDefault();

  const onPointerMove = (move: PointerEvent) => {
    const fraction = widthFractionFromClientX(move.clientX);
    const { actions } = store.getState();
    if (fraction >= PEEK_FULLSCREEN_ENTER_FRACTION) {
      actions.enterFullscreenDraft();
    } else {
      actions.setDraftFraction(fraction);
    }
  };

  const teardown = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  };

  const onPointerUp = () => {
    teardown();
    const { draftFraction, actions } = store.getState();
    // A drag that ended on a widget width commits it; one that ended in
    // fullscreen (draftFraction === null) leaves the persisted width untouched.
    if (draftFraction !== null) actions.commitWidth(draftFraction);
    actions.setResizing(false);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "ew-resize";
  store.getState().actions.setResizing(true);

  return teardown;
}
