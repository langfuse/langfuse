import { Trace } from "@/src/components/trace/Trace";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { useEffect } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";

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
  const traceId = item.parentTraceId ?? item.objectId;

  const [, setCurrentObservationId] = useQueryParam("observation", StringParam);

  // If annotating an observation, set it as selected so the tree highlights it
  useEffect(() => {
    if (item.objectType === AnnotationQueueObjectType.OBSERVATION) {
      setCurrentObservationId(item.objectId);
    } else {
      setCurrentObservationId(undefined);
    }
  }, [item, setCurrentObservationId]);

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
