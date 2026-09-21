import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  AnnotationFormContent,
  usePreparedAnnotationFormTarget,
} from "@/src/features/scores/components/AnnotationForm";
import { Skeleton } from "@/src/components/ui/skeleton";
import { prepareCombinedAnnotationTargets } from "@/src/features/scores/lib/prepareAnnotationFormData";

interface DualAnnotationContentProps {
  projectId: string;
  isV4: boolean;
  traceId: string;
  observationId: string;
  traceEnvironment: string;
  observationEnvironment: string;
  observationScores: WithStringifiedMetadata<ScoreDomain>[];
  traceScores: WithStringifiedMetadata<ScoreDomain>[];
  actionButtons?: React.ReactNode;
  isActive?: boolean;
}

export function DualAnnotationContent({
  projectId,
  isV4,
  traceId,
  observationId,
  traceEnvironment,
  observationEnvironment,
  observationScores,
  traceScores,
  actionButtons,
  isActive = true,
}: DualAnnotationContentProps) {
  const observation = usePreparedAnnotationFormTarget({
    serverScores: observationScores,
    scoreTarget: { type: "trace", traceId, observationId },
    scoreMetadata: { projectId, environment: observationEnvironment },
    analyticsData: { type: "trace", source: "TraceDetail", isV4 },
  });
  const trace = usePreparedAnnotationFormTarget({
    serverScores: traceScores,
    scoreTarget: { type: "trace", traceId },
    scoreMetadata: { projectId, environment: traceEnvironment },
    analyticsData: { type: "trace", source: "TraceDetail", isV4 },
  });
  return (
    <div className="flex max-h-[95vh] flex-col overflow-y-auto [--annotation-surface:var(--modal)]">
      {observation.isLoading || trace.isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <AnnotationFormContent
          key={JSON.stringify([observation.target.key, trace.target.key])}
          targets={prepareCombinedAnnotationTargets([
            observation.target,
            trace.target,
          ])}
          actionButtons={actionButtons}
          isActive={isActive}
        />
      )}
    </div>
  );
}
