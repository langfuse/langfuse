// Shared bounds for every sampling slider in evals v2 so the rule editor, the
// activation dialog, and the evaluator-saved dialog read the same. The floor is
// non-zero because a rule sampled at 0% would never evaluate anything.
export const SAMPLING_SLIDER_MIN = 0.0001;
export const SAMPLING_SLIDER_STEP = 0.0001;
