/** Timing for the shared animations in Scene.module.css: a run's clear, a first build's lead, and each part's start. */

import type { CSSProperties } from "react";
import { round } from "./projection";

/** ms a run takes to clear the resting frame before rebuilding it (--illustration-clear-for, set by the frame). */
export const CLEAR_FOR = 180;

/** ms the stage fades in ahead of everything else in a first build (--illustration-build-lead, set by the frame). */
export const BUILD_LEAD = 80;

/** A start time, later by BUILD_LEAD in a first build. */
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
