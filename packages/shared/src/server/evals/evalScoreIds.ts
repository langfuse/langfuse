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

// JSON.stringify disambiguates 1 vs "1", true/false vs strings, etc.
// CodeEvalScoreWithName.value is `number | string | 0 | 1` after schema parse.
function stableValueKey(value: CodeEvalScoreWithName["value"]): string {
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
  // overwrites the original record. The dispatch-result schema rejects
  // duplicate values within a single eval run, so value keys within a
  // (jobExecutionId, name) group are unique and produce a stable sort.
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
