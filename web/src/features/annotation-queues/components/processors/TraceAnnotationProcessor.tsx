import { useReadPath } from "@/src/features/events";
import { type ScoreTarget, useMergedScores } from "@/src/features/scores";
import { Trace } from "@/src/features/traces";
import {
  type AnnotationQueueItem,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";
import { QueueItemSummaryStrip } from "../QueueItemSummaryStrip";

interface TraceAnnotationProcessorProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  data: any; // Trace data with observations and scores
  configs: ScoreConfigDomain[];
  projectId: string;
}

export const TraceAnnotationProcessor: React.FC<
  TraceAnnotationProcessorProps
> = ({ item, data, configs, projectId }) => {
  const { isV4 } = useReadPath();
  const traceId = item.parentTraceId ?? item.objectId;
  const scoreTarget: ScoreTarget = {
    type: "trace",
    traceId: traceId,
    observationId: item.parentTraceId ? item.objectId : undefined,
  };
  const currentScores = useMergedScores(data?.scores ?? [], scoreTarget);

  if (!data) return <div className="p-3">Loading...</div>;

  const leftPanel = (
    <div className="flex h-full flex-col">
      <QueueItemSummaryStrip
        userId={data.userId}
        timestamp={data.timestamp}
        tags={data.tags}
        scores={currentScores}
        configs={configs}
      />
      <div className="min-h-0 flex-1">
        <Trace
          key={data.id}
          trace={data}
          scores={data.scores}
          corrections={data.corrections}
          projectId={data.projectId}
          observations={data.observations}
          context="annotation"
        />
      </div>
    </div>
  );

  const rightPanel = (
    <AnnotationDrawerSection
      item={item}
      isV4={isV4}
      scoreTarget={scoreTarget}
      scores={data?.scores ?? []}
      configs={configs}
      environment={data?.environment}
    />
  );

  return (
    <AnnotationProcessingLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      projectId={projectId}
    />
  );
};
