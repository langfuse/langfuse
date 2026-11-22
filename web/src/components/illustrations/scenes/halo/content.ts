import type { ValueFormat } from "../../engine/values";

type HaloStep = {
  /** What Halo does, a short verb: find, make, run. */
  verb: string;
  /** What it does it to: "traces", "on 24 traces". */
  object: string;
};

type HaloJob = {
  /** Your message to Halo, typed out at the top. */
  ask: string;
  /** Up to three steps Halo takes on your behalf, in order. */
  steps: HaloStep[];
  /** What you get: a named value that counts up as it lands. */
  result: { label: string; value: number; format?: ValueFormat };
};

export type HaloContent = {
  /** The jobs the scene cycles through, one per run. */
  jobs: HaloJob[];
  /** Which job to show; left out, the scene moves to the next one each run. */
  active?: number;
};

/** Characters per slot before an ellipsis; the frame is sized for these. */
export const HALO_LIMITS = {
  ask: 38,
  verb: 4,
  object: 16,
  steps: 3,
  label: 14,
  jobs: 3,
} as const;

export const HALO_DEFAULTS: HaloContent = {
  jobs: [
    {
      ask: "Set up an evaluator for helpfulness",
      steps: [
        { verb: "find", object: "your traces" },
        { verb: "make", object: "an LLM judge" },
        { verb: "run", object: "on 24 traces" },
      ],
      result: { label: "helpfulness", value: 0.92, format: "decimal" },
    },
    {
      ask: "Improve the support prompt",
      steps: [
        { verb: "read", object: "the prompt" },
        { verb: "edit", object: "version 2" },
        { verb: "test", object: "on 20 cases" },
      ],
      result: { label: "v2 better by", value: 0.12, format: "percent" },
    },
    {
      ask: "Build a dataset from failed traces",
      steps: [
        { verb: "find", object: "24 failures" },
        { verb: "make", object: "a dataset" },
        { verb: "add", object: "24 items" },
      ],
      result: { label: "failed-answers", value: 24, format: "count" },
    },
  ],
};
