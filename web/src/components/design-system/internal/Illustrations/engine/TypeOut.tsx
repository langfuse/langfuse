"use client";

import type { Playback } from "./usePlayback";
import { useStepper } from "./useStepper";

type TypeOutProps = {
  playback: Pick<Playback, "runs" | "startsHidden">;
  text: string;
  /** ms into a run the typing starts. */
  at: number;
  /** ms per character. */
  perChar?: number;
};

/** A <tspan> that types its text out `at` ms into a run. */
export function TypeOut({ playback, text, at, perChar = 28 }: TypeOutProps) {
  const chars = [...text];
  const ref = useStepper(
    playback,
    at,
    Math.max(1, chars.length * perChar),
    (progress) =>
      chars.slice(0, Math.round(chars.length * progress)).join("") || " ",
  );
  return <tspan ref={ref}>{text}</tspan>;
}
