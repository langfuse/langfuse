import { type EditorView, ViewPlugin } from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";

// Distance (px) from the scroller's top/bottom edge within which a drag starts
// auto-scrolling. Also covers the case where the pointer is dragged past the
// edge entirely (negative distance), which is the standard "drag to select
// beyond the visible text" gesture.
const EDGE_THRESHOLD_PX = 24;
// Maximum scroll speed in px per animation frame at/over the edge. The speed
// ramps from 0 at the threshold up to this value as the pointer approaches and
// passes the edge.
const MAX_SCROLL_STEP_PX = 16;

/**
 * CodeMirror does not natively auto-scroll the editor when a text-selection
 * drag reaches the top or bottom edge of its scroll container (`.cm-scroller`).
 * Plain `<textarea>`/`<code>` elements get this from the browser for free, which
 * is why the read-only prompt viewer scrolls on drag but the editor does not.
 *
 * This plugin restores the standard behavior: while the primary button is held
 * down after a mousedown inside the editor, if the pointer sits near or past
 * the scroller's top/bottom edge we continuously scroll the scroller in that
 * direction and extend the selection to the new pointer position, so the
 * selection keeps growing as the content scrolls.
 *
 * The gesture-tracking listeners are attached to `window` for the duration of
 * the drag so scrolling continues even when the pointer leaves the editor
 * bounds (the common case when dragging "past" the edge). Because those
 * window-level listeners and the `requestAnimationFrame` loop are our own side
 * effect — `EditorView` only manages handlers it registered on its own DOM —
 * they must be torn down explicitly if the view is destroyed mid-drag (parent
 * re-render, route change, dialog/sheet close while the primary button is still
 * held). We therefore live as a `ViewPlugin` and tear down the active drag from
 * its `destroy()` hook, mirroring how CodeMirror's own `MouseSelection` cleans
 * up. The normal end-of-gesture teardown still runs on the primary `mouseup`
 * (or when `onMove` sees the primary button released).
 */
class AutoScrollOnSelectionDrag {
  // Cleanup for the currently active drag, if any. There is at most one active
  // drag at a time: starting a new one stops the prior, and the gesture clears
  // this back to null when it ends. The view's `destroy()` invokes it.
  private activeStop: (() => void) | null = null;

  constructor(private readonly view: EditorView) {}

  // Wired as the plugin's `mousedown` event handler (see `eventHandlers`
  // below). CodeMirror registers/unregisters this on the editor DOM itself, so
  // it preserves the original `domEventHandlers({ mousedown })` semantics:
  // it's non-consuming (CodeMirror still drives normal selection) and is torn
  // down with the view automatically.
  mousedown(event: MouseEvent) {
    const view = this.view;

    // Only react to the primary (left) button selection drag.
    if (event.button !== 0) return;

    // Tear down any prior drag before starting a new one so there is only ever
    // one set of window listeners / rAF loop tracked at a time.
    if (this.activeStop !== null) this.activeStop();

    // Only drive selection ourselves for a plain single-range character drag.
    // For advanced gestures — alt+drag rectangular selection (multi-range),
    // double/triple-click word/line selection (`detail > 1`, boundary-snapped),
    // and mod+click multi-cursor (Cmd on macOS / Ctrl elsewhere, which adds a
    // new selection range) — a single-range `{anchor, head}` dispatch would
    // collapse the rectangle/multi-cursor and drop the snapping. In those modes
    // we still auto-scroll but leave selection extension to CodeMirror's own
    // `pointerSelection` (the scroll moves content under the pointer; CM's next
    // mousemove extends with the right granularity).
    //
    // Captured at mousedown: the modifier/detail flags correctly identify "not a
    // multi-range *gesture*" — they describe this click and won't change during
    // the drag. The `ranges.length === 1` half is deliberately NOT captured
    // here: this handler runs before CM's `pointerSelection` commits, so the
    // selection still reflects the pre-click state (e.g. a stale 2-range
    // multi-cursor that a plain click is about to collapse to one range). We
    // therefore re-read `ranges.length` live inside `step()`, immediately before
    // the dispatch, instead of trusting this pre-click snapshot.
    const isSingleRangeGesture =
      event.detail === 1 && !event.altKey && !event.metaKey && !event.ctrlKey;

    const scroller = view.scrollDOM;
    let lastClientX = event.clientX;
    let lastClientY = event.clientY;
    let frame: number | null = null;

    const step = () => {
      frame = null;
      const rect = scroller.getBoundingClientRect();
      const distanceFromTop = lastClientY - rect.top;
      const distanceFromBottom = rect.bottom - lastClientY;

      let delta = 0;
      if (distanceFromTop < EDGE_THRESHOLD_PX) {
        // Near/above the top edge: scroll up. Ramp speed as we approach and
        // pass the edge, clamped to the max step.
        const intensity = Math.min(
          1,
          (EDGE_THRESHOLD_PX - distanceFromTop) / EDGE_THRESHOLD_PX,
        );
        delta = -Math.ceil(intensity * MAX_SCROLL_STEP_PX);
      } else if (distanceFromBottom < EDGE_THRESHOLD_PX) {
        // Near/below the bottom edge: scroll down.
        const intensity = Math.min(
          1,
          (EDGE_THRESHOLD_PX - distanceFromBottom) / EDGE_THRESHOLD_PX,
        );
        delta = Math.ceil(intensity * MAX_SCROLL_STEP_PX);
      }

      if (delta === 0) return; // Pointer back inside the safe zone; idle.

      const before = scroller.scrollTop;
      scroller.scrollTop = before + delta;
      const scrolled = scroller.scrollTop !== before;

      // Extend the selection to the position under the (clamped) pointer so the
      // highlighted range keeps growing with the scroll. Clamp Y into the
      // scroller so posAtCoords resolves to the first/last visible line. Only
      // for the plain single-range drag; advanced gestures are left to CM.
      // `ranges.length` is read live here (not captured at mousedown) so a
      // pre-click multi-cursor that a plain click has since collapsed to one
      // range is handled correctly — by dispatch time the selection is current.
      if (
        scrolled &&
        isSingleRangeGesture &&
        view.state.selection.ranges.length === 1
      ) {
        const rectAfter = scroller.getBoundingClientRect();
        const clampedY = Math.max(
          rectAfter.top + 1,
          Math.min(rectAfter.bottom - 1, lastClientY),
        );
        const pos = view.posAtCoords({ x: lastClientX, y: clampedY });
        if (pos !== null) {
          view.dispatch({
            selection: {
              anchor: view.state.selection.main.anchor,
              head: pos,
            },
          });
        }
      }

      // Keep the loop alive while the pointer is past the edge (`delta !== 0`),
      // even if the scroller is already at the top/bottom and didn't move.
      // Otherwise, if the pointer is held still past the edge, no mousemove
      // fires to restart the loop and scrolling never resumes when the user
      // drags back — native textareas resume immediately. This only runs during
      // an active drag and ends on mouseup (or when delta returns to 0).
      frame = requestAnimationFrame(step);
    };

    const onMove = (e: MouseEvent) => {
      // Drag ended elsewhere without us seeing mouseup (e.g. button released
      // off-window); stop once the primary button is released. Only the primary
      // bit matters — a secondary/middle button held or released mid-drag must
      // not end the gesture.
      if ((e.buttons & 1) === 0) {
        stop();
        return;
      }
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (frame === null) frame = requestAnimationFrame(step);
    };

    const stop = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      // Clear the plugin-tracked handle if this drag still owns it, so a later
      // `destroy()` doesn't call a stale stop and a new drag starts clean.
      if (this.activeStop === stop) this.activeStop = null;
    };

    // Only the primary button's release ends the gesture; releasing a stray
    // secondary/middle button mid-drag must not tear down auto-scroll while the
    // primary is still held. `stop` itself stays callable without an event for
    // the `onMove` (off-window release) and `destroy()` paths.
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) stop();
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);

    // Track this drag so the view's `destroy()` can tear it down if the editor
    // unmounts before the primary button is released.
    this.activeStop = stop;

    // Don't consume the event; CodeMirror still drives normal selection.
  }

  destroy() {
    // View destroyed mid-drag (parent re-render, route change, dialog/sheet
    // close while the primary button is still held): tear down the active
    // drag's window listeners and rAF loop. CodeMirror removes the `mousedown`
    // handler it registered for us.
    if (this.activeStop !== null) this.activeStop();
  }
}

export function autoScrollOnSelectionDrag(): Extension {
  return ViewPlugin.fromClass(AutoScrollOnSelectionDrag, {
    eventHandlers: {
      mousedown(event) {
        this.mousedown(event);
      },
    },
  });
}
