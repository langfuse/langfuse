import { EditorView } from "@uiw/react-codemirror";
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
 * This extension restores the standard behavior: while the primary button is
 * held down after a mousedown inside the editor, if the pointer sits near or
 * past the scroller's top/bottom edge we continuously scroll the scroller in
 * that direction and extend the selection to the new pointer position, so the
 * selection keeps growing as the content scrolls.
 *
 * The gesture-tracking listeners are attached to `window` for the duration of
 * the drag so scrolling continues even when the pointer leaves the editor
 * bounds (the common case when dragging "past" the edge).
 */
export function autoScrollOnSelectionDrag(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      // Only react to the primary (left) button selection drag.
      if (event.button !== 0) return false;

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
        if (scroller.scrollTop === before) {
          // Hit the top/bottom of the document; nothing more to scroll.
          return;
        }

        // Extend the selection to the position under the (clamped) pointer so
        // the highlighted range keeps growing with the scroll. Clamp Y into the
        // scroller so posAtCoords resolves to the first/last visible line.
        const rectAfter = scroller.getBoundingClientRect();
        const clampedY = Math.max(
          rectAfter.top + 1,
          Math.min(rectAfter.bottom - 1, lastClientY),
        );
        const pos = view.posAtCoords({ x: lastClientX, y: clampedY });
        if (pos !== null) {
          view.dispatch({
            selection: { anchor: view.state.selection.main.anchor, head: pos },
          });
        }

        frame = requestAnimationFrame(step);
      };

      const onMove = (e: MouseEvent) => {
        // Drag ended elsewhere without us seeing mouseup (e.g. button released
        // off-window); stop if no buttons are pressed.
        if (e.buttons === 0) {
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
        window.removeEventListener("mouseup", stop, true);
      };

      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", stop, true);

      // Don't consume the event; CodeMirror still drives normal selection.
      return false;
    },
  });
}
