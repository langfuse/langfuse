export type PromptContent = {
  /** The version stack, oldest first; the last one is live behind the label. Up to four. */
  versions: string[];
  /** The version on the raised block, tagged (an experiment, a staging build). */
  experiment: { version: string; tag: string };
  /** Who made the experiment. */
  author: string;
  /** The deployment label wired to the live version and the experiment. */
  label: string;
};

/** Characters per slot before an ellipsis; the frame is sized for these. */
export const PROMPT_LIMITS = {
  versions: 4,
  version: 4,
  tag: 8,
  author: 18,
  label: 14,
} as const;

export const PROMPT_DEFAULTS: PromptContent = {
  versions: ["v1", "v2", "v3"],
  experiment: { version: "v2", tag: "Exp" },
  author: "Alex Rivera",
  label: "Production",
};
