import type { APIScoreV3 } from "@langfuse/shared";
import { buildScoreTargetUrl } from "@/src/utils/product-url";

export const buildScoreSubjectUrl = (
  projectId: string,
  subject: APIScoreV3["subject"],
): string | undefined => {
  if (!subject) return undefined;

  switch (subject.kind) {
    case "trace":
      return buildScoreTargetUrl({ projectId, traceId: subject.id });
    case "observation":
      return buildScoreTargetUrl({
        projectId,
        traceId: subject.traceId,
        observationId: subject.id,
      });
    case "session":
      return buildScoreTargetUrl({ projectId, sessionId: subject.id });
    case "experiment":
      // Experiment URLs need the dataset ID, which the score does not carry.
      return undefined;
  }
};
