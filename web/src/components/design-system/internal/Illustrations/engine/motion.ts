/**
 * Timing for the shared, fixed animations (press, pop, draw, slide) in Scene.module.css. Motion that depends on the
 * content lives in keyframes.ts.
 */

import type { CSSProperties } from "react";
import { round } from "./projection";

/** A start time, later by the stage's lead in a first build (--illustration-build-lead, set by the frame). */
export const startAt = (ms: number) =>
  `calc(${round(ms)}ms + var(--illustration-build-lead, 0ms))`;

/** Timing for the shared animations in Scene.module.css: when the element clears and when it comes back. */
export const at = (
  revealAt: number,
  clearAt = 0,
  duration?: number,
): CSSProperties =>
  ({
    "--at": startAt(revealAt),
    "--clear-at": `${round(clearAt)}ms`,
    ...(duration === undefined ? {} : { "--dur": `${round(duration)}ms` }),
  }) as CSSProperties;
