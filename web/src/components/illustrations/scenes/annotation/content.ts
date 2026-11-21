export type AnnotationContent = {
  /** A dropdown: the field's label, and the option picked, shown as written. */
  category: { label: string; value: string };
  /** A True / False toggle; the picked side is the raised block. */
  check: { label: string; value: boolean };
  /** A score bar filled to `value` out of `max`; the rest is hatched. */
  score: { label: string; value: number; max: number };
};

/** Characters per slot before an ellipsis; the form's column is fixed, so these keep it inside. */
export const ANNOTATION_LIMITS = { label: 28, category: 18, score: 7 } as const;

export const ANNOTATION_DEFAULTS: AnnotationContent = {
  category: { label: "Question type", value: "technical issue" },
  check: { label: "Is JSON output?", value: true },
  score: { label: "Answer Quality", value: 8, max: 10 },
};
