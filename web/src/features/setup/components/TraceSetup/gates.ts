import type { Tip, TraceReading } from "./firstTrace";
import type { FirstTraceNode, Scoring } from "./types";

/**
 * The gates between a first trace and a project that's set up, in order of what each unlocks: nothing in it failed,
 * it's complete enough for cost, scores and the playground, an evaluator scores new traces, and someone else has
 * joined. That the data is the app's needs no gate: the trace on screen is it.
 */
export type Gate = "nothingBroken" | "usableData" | "keepsWorking" | "shared";

/** A gate the project hasn't passed, with what holds it open. */
export type OpenGate =
  | { gate: "nothingBroken"; failed: FirstTraceNode }
  | { gate: "usableData"; tip: Tip }
  | { gate: "keepsWorking"; scoring: Exclude<Scoring, { status: "scored" }> }
  | { gate: "shared" };

/** The gates still open, in order, read from the trace on screen, its scoring and the team. */
export function openGatesOf({
  reading: { failed, tip },
  scoring,
  hasTeammates,
}: {
  reading: Pick<TraceReading, "failed" | "tip">;
  scoring: Scoring;
  hasTeammates: boolean;
}): OpenGate[] {
  return [
    ...(failed ? [{ gate: "nothingBroken", failed } satisfies OpenGate] : []),
    ...(tip ? [{ gate: "usableData", tip } satisfies OpenGate] : []),
    ...(scoring.status === "scored"
      ? []
      : [{ gate: "keepsWorking", scoring } satisfies OpenGate]),
    ...(hasTeammates ? [] : [{ gate: "shared" } satisfies OpenGate]),
  ];
}

/** The next step: the first open gate not skipped, or `null` when none is left. */
export function nextGateOf(
  open: readonly OpenGate[],
  skipped: readonly Gate[],
) {
  return open.find(({ gate }) => !skipped.includes(gate)) ?? null;
}

/** Set up: every gate but the team's is passed. A skipped gate doesn't count. */
export function isSetUp(open: readonly OpenGate[]) {
  return open.every(({ gate }) => gate === "shared");
}
