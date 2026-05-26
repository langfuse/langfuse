import { v5 } from "uuid";
import type { CodeEvalScoreWithName } from "./codeEvalDispatcherTypes";

const EVAL_SCORE_ID_NAMESPACE = "52b93de0-1d6c-4fb3-9f65-e5173184b1cb";

export function createDeterministicEvalScoreId(params: {
  jobExecutionId: string;
  scoreName: string;
  occurrenceIndex: number;
}): string {
  return v5(
    JSON.stringify([
      "eval-score",
      params.jobExecutionId,
      params.scoreName,
      params.occurrenceIndex,
    ]),
    EVAL_SCORE_ID_NAMESPACE,
  );
}

// Canonical string key used to order positions within a multi-occurrence
// (jobExecutionId, name) group. The key MUST distinguish every primitive
// value that `CodeEvalScoreWithName.value` can hold so equal-value ties in
// the sort fall back to original input order — which would reintroduce the
// positional bug — only when the underlying values really are equal.
//
// JSON.stringify on its own collapses NaN/Infinity/-Infinity to the literal
// "null", and that collision is reachable from numeric code-based eval
// outputs (Zod's `z.number()` accepts NaN by default), so those three cases
// are special-cased before falling back to JSON.stringify, which handles the
// `1` vs `"1"` discrimination correctly.
function stableValueKey(value: CodeEvalScoreWithName["value"]): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    if (Number.isNaN(value)) return "n:NaN";
    return value > 0 ? "n:+Infinity" : "n:-Infinity";
  }
  return JSON.stringify(value);
}

export function buildDeterministicEvalScoreIds(params: {
  scores: CodeEvalScoreWithName[];
  jobExecutionId: string;
}): string[] {
  // For multi-occurrence score names (multi-match categorical evals), the
  // occurrenceIndex must be derived from a canonical ordering of the score
  // VALUES, not from array position. Otherwise a retry whose LLM returns the
  // same value set in a different order maps the same occurrenceIndex to a
  // different value, and the ReplacingMergeTree score store silently
  // overwrites the original record.
  //
  // Uniqueness invariant per (jobExecutionId, name) group:
  //   - LLM-as-judge path: `buildEvalOutputResultSchema` rejects duplicate
  //     categorical matches in a single run, so value keys are unique and
  //     the sort is fully determined.
  //   - Code-based path: `CodeEvalDispatchResultSchema` does not yet enforce
  //     (name, value) uniqueness, so a code evaluator that returns two
  //     scores with identical name AND value still ties in the comparator
  //     and falls back — via JS's stable sort — to original input order for
  //     that exact pair. That is the same positional behavior as before
  //     this change, so we never regress; the gain is purely additive for
  //     all other multi-occurrence cases.
  //
  // Single-occurrence names keep occurrenceIndex 0, which preserves the IDs
  // already produced for numeric/boolean/single-categorical evals.
  const positionsByName = new Map<string, number[]>();
  params.scores.forEach((score, idx) => {
    const list = positionsByName.get(score.name) ?? [];
    list.push(idx);
    positionsByName.set(score.name, list);
  });

  const ids = new Array<string>(params.scores.length);
  for (const [name, positions] of positionsByName) {
    if (positions.length === 1) {
      ids[positions[0]!] = createDeterministicEvalScoreId({
        jobExecutionId: params.jobExecutionId,
        scoreName: name,
        occurrenceIndex: 0,
      });
      continue;
    }
    const sortedPositions = [...positions].sort((a, b) => {
      const ka = stableValueKey(params.scores[a]!.value);
      const kb = stableValueKey(params.scores[b]!.value);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    sortedPositions.forEach((originalPosition, occurrenceIndex) => {
      ids[originalPosition] = createDeterministicEvalScoreId({
        jobExecutionId: params.jobExecutionId,
        scoreName: name,
        occurrenceIndex,
      });
    });
  }
  return ids;
}
