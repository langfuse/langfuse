import { useReadPath } from "@/src/features/events";
import { Trace } from "@/src/features/traces";
import {
  type AnnotationQueueItem,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import type { AnnotationRefreshHandle } from "@/src/features/scores";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";
import type { Ref } from "react";

interface TraceAnnotationProcessorProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  data: any; // Trace data with observations and scores
  configs: ScoreConfigDomain[];
  projectId: string;
  annotationRefreshRef?: Ref<AnnotationRefreshHandle>;
}

export const TraceAnnotationProcessor: React.FC<
  TraceAnnotationProcessorProps
> = ({ item, data, configs, projectId, annotationRefreshRef }) => {
  const { isV4 } = useReadPath();
  const traceId = item.parentTraceId ?? item.objectId;

  if (!data) return <div className="p-3">Loading...</div>;

  const leftPanel = (
    <Trace
      key={data.id}
      trace={data}
      scores={data.scores}
      corrections={data.corrections}
      projectId={data.projectId}
      observations={data.observations}
      context="annotation"
    />
  );

  const rightPanel = (
    <AnnotationDrawerSection
      item={item}
      isV4={isV4}
      annotationRefreshRef={annotationRefreshRef}
      scoreTarget={{
        type: "trace",
        traceId: traceId,
        observationId: item.parentTraceId ? item.objectId : undefined,
      }}
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
