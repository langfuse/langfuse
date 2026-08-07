import type { TrajectoryFeatures } from "./signature";

/**
 * Scoring a trajectory against the distribution of paths a pipeline normally
 * takes.
 *
 * The rules below are deliberately an explicit, thresholded decision tree
 * rather than a learned black box. Two reasons:
 *
 *  1. A drift verdict has to be defensible. In a fraud-review setting the
 *     question "why was this run flagged" is asked by someone who needs an
 *     answer they can put in front of an auditor, and "the model said so" is
 *     not one. Every rule here emits the evidence that fired it.
 *  2. It is testable. Each threshold can be exercised against a hand-built
 *     tree, which a learned scorer cannot be.
 *
 * Thresholds are stated as named constants with the reasoning attached, so
 * they can be re-tuned against a labelled corpus rather than guessed at.
 */

/** Below this many baseline runs the distribution is not worth trusting. */
export const MIN_BASELINE_RUNS = 30;

/** A step this common in the baseline is treated as part of the golden path. */
export const CORE_STEP_FREQUENCY = 0.95;

/** A signature rarer than this is unusual but not by itself alarming. */
export const RARE_SIGNATURE_SHARE = 0.01;

/** Standard deviations of step count before size alone counts as evidence. */
export const STEP_COUNT_Z_LIMIT = 3;

/**
 * A behaviour seen in fewer than this share of baseline runs counts as rare.
 *
 * This replaced two fixed thresholds (a p99 on repeat length, and a 2% "quiet
 * baseline" error rate) that measurement showed were self-defeating. The
 * baseline is drawn from real traffic, so a failure mode that occurs in, say,
 * 5.75% of runs raises the p99 to its own value and lifts the error rate above
 * a 2% floor - the anomaly teaches the baseline to accept it, and the rule
 * stops firing exactly when the problem becomes common enough to matter.
 *
 * Comparing against a *share* instead degrades gracefully: the rule keeps
 * firing until the behaviour genuinely is ordinary, and the point at which
 * that happens is one explicit number rather than an emergent property of a
 * percentile.
 */
export const RARE_BEHAVIOUR_SHARE = 0.1;

export const RULE_WEIGHTS = {
  UNSEEN_SIGNATURE: 0.4,
  RARE_SIGNATURE: 0.15,
  UNSEEN_EDGE: 0.3,
  MISSING_CORE_STEP: 0.35,
  EXCESS_REPEAT: 0.25,
  STEP_COUNT_OUTLIER: 0.2,
  UNEXPECTED_ERRORS: 0.15,
} as const;

export type DriftRule = keyof typeof RULE_WEIGHTS;

export type DriftReason = {
  rule: DriftRule;
  weight: number;
  detail: string;
};

export type DriftAssessment = {
  /** 0 = indistinguishable from normal, 1 = maximally abnormal. */
  score: number;
  reasons: DriftReason[];
  /** False when the baseline was too small to judge against. */
  evaluated: boolean;
};

export type TrajectoryBaseline = {
  totalRuns: number;
  /** signature -> number of baseline runs with that signature. */
  signatureCounts: Record<string, number>;
  /** `TYPE:name` -> fraction of baseline runs containing it. */
  stepFrequency: Record<string, number>;
  /** Every `parent>child` transition seen in the baseline. */
  edges: string[];
  stepCountMean: number;
  stepCountStdDev: number;
  /**
   * `TYPE:name` -> (repeat length -> number of baseline runs at that length).
   *
   * Kept per step rather than as one distribution over the run's maximum. A
   * tool retrying six times and an adjudicator looping eight times are
   * different faults; pooling them means the commoner one raises the bar for
   * the rarer one and hides it.
   */
  repeatsByStep: Record<string, Record<string, number>>;
  /** Fraction of baseline runs containing any ERROR/WARNING observation. */
  errorRunRate: number;
};

/** Share of baseline runs where `step` repeated at least `value` times. */
export function repeatShareAtLeast(
  baseline: TrajectoryBaseline,
  step: string,
  value: number,
): number {
  if (baseline.totalRuns === 0) return 0;
  const distribution = baseline.repeatsByStep[step];
  if (!distribution) return 0;
  let matching = 0;
  for (const [repeat, count] of Object.entries(distribution)) {
    if (Number(repeat) >= value) matching += count;
  }
  return matching / baseline.totalRuns;
}

/** Summarise a set of historical runs into the distribution to compare against. */
export function buildBaseline(
  runs: readonly TrajectoryFeatures[],
): TrajectoryBaseline {
  const totalRuns = runs.length;
  const signatureCounts: Record<string, number> = {};
  const stepCounts: Record<string, number> = {};
  const repeatsByStep: Record<string, Record<string, number>> = {};
  const edges = new Set<string>();
  let stepCountSum = 0;
  let errorRuns = 0;

  for (const run of runs) {
    signatureCounts[run.signature] = (signatureCounts[run.signature] ?? 0) + 1;
    for (const step of new Set(run.steps)) {
      stepCounts[step] = (stepCounts[step] ?? 0) + 1;
    }
    for (const edge of run.edges) edges.add(edge);
    stepCountSum += run.stepCount;
    if (run.errorCount > 0) errorRuns++;
    for (const [step, repeat] of Object.entries(run.repeatsByStep)) {
      const distribution = (repeatsByStep[step] ??= {});
      const key = String(repeat);
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
  }

  const stepCountMean = totalRuns > 0 ? stepCountSum / totalRuns : 0;
  const variance =
    totalRuns > 0
      ? runs.reduce((acc, r) => acc + (r.stepCount - stepCountMean) ** 2, 0) /
        totalRuns
      : 0;

  const stepFrequency: Record<string, number> = {};
  for (const [step, count] of Object.entries(stepCounts)) {
    stepFrequency[step] = totalRuns > 0 ? count / totalRuns : 0;
  }

  return {
    totalRuns,
    signatureCounts,
    stepFrequency,
    edges: [...edges].sort(),
    stepCountMean,
    stepCountStdDev: Math.sqrt(variance),
    repeatsByStep,
    errorRunRate: totalRuns > 0 ? errorRuns / totalRuns : 0,
  };
}

/**
 * Score one run against a baseline.
 *
 * Weights are additive and clamped at 1. Rules that can fire many times per
 * run (unseen edges, missing core steps) are capped at a single weight each,
 * so one structurally odd run cannot out-score a genuinely dangerous one just
 * by being large.
 */
export function assessDrift(
  features: TrajectoryFeatures,
  baseline: TrajectoryBaseline,
): DriftAssessment {
  if (baseline.totalRuns < MIN_BASELINE_RUNS) {
    return { score: 0, reasons: [], evaluated: false };
  }

  const reasons: DriftReason[] = [];
  const push = (rule: DriftRule, detail: string) =>
    reasons.push({ rule, weight: RULE_WEIGHTS[rule], detail });

  // R1/R2 - has this exact path ever been taken before?
  const seen = baseline.signatureCounts[features.signature] ?? 0;
  if (seen === 0) {
    push(
      "UNSEEN_SIGNATURE",
      `path ${features.signature} does not appear in ${baseline.totalRuns} baseline runs`,
    );
  } else if (seen / baseline.totalRuns < RARE_SIGNATURE_SHARE) {
    push(
      "RARE_SIGNATURE",
      `path ${features.signature} seen in ${seen}/${baseline.totalRuns} baseline runs`,
    );
  }

  // R3 - a transition the pipeline has never made before.
  const knownEdges = new Set(baseline.edges);
  const novelEdges = features.edges.filter((e) => !knownEdges.has(e));
  if (novelEdges.length > 0) {
    push(
      "UNSEEN_EDGE",
      `${novelEdges.length} unseen transition(s): ${novelEdges.slice(0, 3).join(", ")}`,
    );
  }

  // R4 - a step the pipeline almost always runs did not run. This is the rule
  // that catches a hijacked router: the forensic checks are simply absent.
  const present = new Set(features.steps);
  const missing = Object.entries(baseline.stepFrequency)
    .filter(([step, freq]) => freq >= CORE_STEP_FREQUENCY && !present.has(step))
    .map(([step]) => step);
  if (missing.length > 0) {
    push(
      "MISSING_CORE_STEP",
      `${missing.length} core step(s) skipped: ${missing.slice(0, 4).join(", ")}`,
    );
  }

  // R5 - a step looping or retrying more than the baseline normally does.
  // Evaluated per step, and reported for the rarest one, so that the run is
  // flagged with the specific step that misbehaved rather than a bare number.
  let rarestRepeat: { step: string; repeat: number; share: number } | null =
    null;
  for (const [step, repeat] of Object.entries(features.repeatsByStep)) {
    const share = repeatShareAtLeast(baseline, step, repeat);
    if (share < RARE_BEHAVIOUR_SHARE) {
      if (rarestRepeat === null || share < rarestRepeat.share) {
        rarestRepeat = { step, repeat, share };
      }
    }
  }
  if (rarestRepeat) {
    push(
      "EXCESS_REPEAT",
      `${rarestRepeat.step} repeated ${rarestRepeat.repeat}x, seen in ${(
        rarestRepeat.share * 100
      ).toFixed(1)}% of baseline runs`,
    );
  }

  // R6 - the run is far larger or smaller than normal.
  if (baseline.stepCountStdDev > 0) {
    const z =
      (features.stepCount - baseline.stepCountMean) / baseline.stepCountStdDev;
    if (Math.abs(z) > STEP_COUNT_Z_LIMIT) {
      push(
        "STEP_COUNT_OUTLIER",
        `${features.stepCount} steps is ${z.toFixed(1)}σ from the baseline mean of ${baseline.stepCountMean.toFixed(1)}`,
      );
    }
  }

  // R7 - errors in a pipeline that is normally quiet.
  if (features.errorCount > 0 && baseline.errorRunRate < RARE_BEHAVIOUR_SHARE) {
    push(
      "UNEXPECTED_ERRORS",
      `${features.errorCount} error/warning observation(s) in a baseline that errors in ${(baseline.errorRunRate * 100).toFixed(1)}% of runs`,
    );
  }

  const score = Math.min(
    1,
    reasons.reduce((acc, r) => acc + r.weight, 0),
  );
  return { score: Number(score.toFixed(4)), reasons, evaluated: true };
}
