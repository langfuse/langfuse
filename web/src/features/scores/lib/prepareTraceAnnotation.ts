import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type AnnotationPanelData } from "../types";

/** Prepare the single selected trace or observation for the annotation form. */
export function prepareTraceAnnotation({
  traceId,
  projectId,
  environment,
  observationId,
  scores,
  isV4,
}: {
  traceId: string;
  projectId: string;
  environment: string;
  observationId?: string;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  isV4: boolean;
}) {
  return {
    scoreTarget: { type: "trace", traceId, observationId },
    scores: scores.filter((score) =>
      observationId
        ? score.observationId === observationId
        : !score.observationId,
    ),
    analyticsData: { type: "trace", source: "TraceDetail", isV4 },
    scoreMetadata: { projectId, environment },
  } satisfies AnnotationPanelData;
}
