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

export function buildDeterministicEvalScoreIds(params: {
  scores: CodeEvalScoreWithName[];
  jobExecutionId: string;
}): string[] {
  const occurrenceByScoreName = new Map<string, number>();

  return params.scores.map((score) => {
    const occurrenceIndex = occurrenceByScoreName.get(score.name) ?? 0;
    occurrenceByScoreName.set(score.name, occurrenceIndex + 1);

    return createDeterministicEvalScoreId({
      jobExecutionId: params.jobExecutionId,
      scoreName: score.name,
      occurrenceIndex,
    });
  });
}
