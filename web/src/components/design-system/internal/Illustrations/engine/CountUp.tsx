"use client";

import type { Playback } from "./usePlayback";
import { useStepper } from "./useStepper";
import type { FormattedValue } from "./values";

type CountUpProps = {
  playback: Pick<Playback, "runs" | "startsHidden">;
  value: FormattedValue;
  /** ms into a run the count starts. */
  at: number;
  duration?: number;
};

const easeOutExpo = (progress: number) =>
  progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);

/** A value's <tspan>; numbers count up from zero `at` ms into a run, never wider than where they land. */
export function CountUp({ playback, value, at, duration = 900 }: CountUpProps) {
  const { count } = value;
  const ref = useStepper(playback, at, duration, (progress) =>
    count ? count.format(count.to * easeOutExpo(progress)) : value.text,
  );
  return <tspan ref={ref}>{value.text}</tspan>;
}
