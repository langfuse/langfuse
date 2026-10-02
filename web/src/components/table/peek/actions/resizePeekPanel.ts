import { type PointerEvent as ReactPointerEvent } from "react";
import {
  PEEK_EXPAND_ENTER_FRACTION,
  type PeekPanelStore,
} from "@/src/components/table/peek/store/peekPanelStore";

/** Viewport fraction to the RIGHT of the pointer (the panel is docked right). */
function widthFractionFromClientX(clientX: number): number {
  return 1 - clientX / window.innerWidth;
}

/**
 * Drag workflow for the left-edge resize handle. Attaches window pointer
 * listeners, drives the store's transient drag state, and on pointer-up either
 * commits a widget width or flips the expanded flag via `commitExpanded` (which
 * writes the URL). Dragging past {@link PEEK_EXPAND_ENTER_FRACTION} previews
 * (and, on release, commits) the expanded max width — so the drag and the
 * header button are two triggers of the same expanded state.
 *
 * Not a hook — it takes the store instance directly (per the local-feature
 * state pattern). Returns a teardown that ends an in-flight drag; the caller
 * also runs it on unmount / when the peek closes so a drag interrupted mid-flight
 * can't leak listeners or leave the body cursor/selection styles applied.
 */
export function beginPeekResize(
  store: PeekPanelStore,
  event: ReactPointerEvent,
  commitExpanded: (expanded: boolean) => void,
  // Fraction at which the drag flips to "expanded" — the sidebar edge
  // (`viewport − sidebar`), passed live by the hook so the panel stops exactly
  // at the sidebar instead of overshooting onto it and snapping back. Defaults
  // to the static threshold when no sidebar offset is known.
  expandAtFraction: number = PEEK_EXPAND_ENTER_FRACTION,
  // Whether the panel is currently expanded. The drag seeds its draft from
  // this so merely PRESSING the handle doesn't change the width — only moving
  // does (otherwise starting a drag while expanded snaps to the widget width
  // on pointer-down, a visible jump).
  startExpanded = false,
  // Notified once per drag gesture that commits a widget width (not on
  // expand-commits or cancelled drags) — the hook's analytics seam.
  onWidthCommit?: (fraction: number) => void,
): () => void {
  // Only primary-button drags; the keyboard path handles the rest.
  if (event.button !== 0) return () => {};
  event.preventDefault();

  const onPointerMove = (move: PointerEvent) => {
    const fraction = widthFractionFromClientX(move.clientX);
    const { actions } = store.getState();
    // At/past the sidebar edge (incl. the pointer leaving the window) →
    // expanded; never let the widget width overshoot onto the sidebar.
    if (fraction >= expandAtFraction) {
      actions.setDraftExpanded();
    } else {
      actions.setDraftFraction(fraction);
    }
  };

  const teardown = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  };

  const onPointerUp = () => {
    teardown();
    const { draftExpanded, draftFraction, actions } = store.getState();
    if (draftExpanded) {
      // Released past the threshold → expanded (reflected in the URL).
      commitExpanded(true);
    } else if (draftFraction !== null) {
      // Released on a widget width → persist it and ensure we're collapsed.
      actions.commitWidth(draftFraction);
      commitExpanded(false);
      onWidthCommit?.(draftFraction);
    }
    // The hook holds the committed expanded value (pendingExpanded) until the
    // URL catches up, so clearing the drag state here can't flash the old width.
    actions.cancelResize();
  };

  // pointercancel is an ABORT, not a release (system gesture intercept, palm
  // rejection, accessibility tooling, pointer-capture transfer, OS interrupt).
  // Tear down and drop the in-flight draft WITHOUT committing — a cancelled
  // gesture must not overwrite the persisted width or flip the expanded flag.
  const onPointerCancel = () => {
    teardown();
    store.getState().actions.cancelResize();
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "ew-resize";
  store.getState().actions.setResizing(true);
  // Seed the draft to the current width so pressing the handle is a no-op until
  // the pointer actually moves.
  if (startExpanded) store.getState().actions.setDraftExpanded();

  return teardown;
}
