import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { Separator } from "@/src/components/ui/separator";

interface DualAnnotationContentProps {
  projectId: string;
  traceId: string;
  observationId: string;
  traceEnvironment: string;
  observationEnvironment: string;
  observationScores: WithStringifiedMetadata<ScoreDomain>[];
  traceScores: WithStringifiedMetadata<ScoreDomain>[];
}

export function DualAnnotationContent({
  projectId,
  traceId,
  observationId,
  traceEnvironment,
  observationEnvironment,
  observationScores,
  traceScores,
}: DualAnnotationContentProps) {
  return (
    <div className="flex max-h-[95vh] flex-col gap-4 overflow-y-auto">
      {/* Observation-level scores */}
      <div>
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Observation Scores
        </div>
        <AnnotationForm
          serverScores={observationScores}
          scoreTarget={{
            type: "trace",
            traceId,
            observationId,
          }}
          scoreMetadata={{
            projectId,
            environment: observationEnvironment,
          }}
        />
      </div>

      <Separator />

      {/* Trace-level scores */}
      <div>
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Trace Scores
        </div>
        <AnnotationForm
          serverScores={traceScores}
          scoreTarget={{
            type: "trace",
            traceId,
          }}
          scoreMetadata={{
            projectId,
            environment: traceEnvironment,
          }}
        />
      </div>
    </div>
  );
}
