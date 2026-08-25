/**
 * Where a pointer-anchored tooltip goes, in viewport coordinates.
 *
 * Pure because the interesting part is the edges, and the edges are a function of
 * two viewport sizes and a point — none of which a story can vary, since a play
 * function cannot resize the window it runs in. Here they can all be swept.
 *
 * The rule: anchor to whichever side of the pointer has MORE room, and cap the
 * width at the room that side actually has. Both halves are load-bearing.
 * Choosing a side by a fixed threshold and capping the width at a fixed number
 * are independently reasonable and jointly wrong — on a window narrower than
 * ~830px a pointer just short of the threshold anchored left and then ran a
 * 320px box off the right edge, which is the clipping this replaced, one axis
 * over.
 *
 * Nothing here measures the tooltip. A size is not knowable before the thing is
 * rendered, and something that must be measured before it can be placed is
 * placed wrongly once, visibly, every time it appears.
 */

/** How far off the pointer the tooltip sits, so the cursor never covers it. */
const OFFSET_PX = 12;
/** Widest it ever gets, room permitting. */
const MAX_WIDTH_PX = 320;
/** Kept off the viewport edge itself. */
const EDGE_PX = 4;
/**
 * Never priced below this: a window narrow enough to force it is narrower than
 * any real one, and a zero-width tooltip is worse than one hanging over an edge.
 */
const MIN_WIDTH_PX = 60;

export type TooltipPlacement = {
  left: number;
  top: number;
  /** `translate(…)` — the flip, which is what keeps this measurement-free. */
  transform: string;
  maxWidth: number;
};

export function tooltipPlacement(input: {
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
}): TooltipPlacement {
  const { clientX, clientY, viewportWidth, viewportHeight } = input;
  // The roomier side, not a fixed fraction: at the halfway point the two are
  // equal, so this is the only split that cannot pick the cramped one.
  const flipX = clientX > viewportWidth / 2;
  const flipY = clientY > viewportHeight / 2;

  const roomX = flipX
    ? clientX - OFFSET_PX - EDGE_PX
    : viewportWidth - clientX - OFFSET_PX - EDGE_PX;

  return {
    left: clientX + (flipX ? -OFFSET_PX : OFFSET_PX),
    top: clientY + (flipY ? -OFFSET_PX : OFFSET_PX),
    transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
    maxWidth: Math.max(Math.min(MAX_WIDTH_PX, roomX), MIN_WIDTH_PX),
  };
}
