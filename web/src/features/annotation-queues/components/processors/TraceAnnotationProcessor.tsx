import { Trace } from "@/src/components/trace";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";
import { TracePreview } from "@/src/components/trace/TracePreview";
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
  view: "showTree" | "hideTree";
  configs: ScoreConfigDomain[];
  projectId: string;
  onHasCommentDraftChange?: (hasDraft: boolean) => void;
}

export const TraceAnnotationProcessor: React.FC<
  TraceAnnotationProcessorProps
> = ({ item, data, view, configs, projectId, onHasCommentDraftChange }) => {
  const traceId = item.parentTraceId ?? item.objectId;

  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );

  useEffect(() => {
    if (
      view === "showTree" &&
      item.objectType === AnnotationQueueObjectType.OBSERVATION
    ) {
      setCurrentObservationId(item.objectId);
    } else setCurrentObservationId(undefined);
  }, [view, item, setCurrentObservationId]);

  if (!data) return <div className="p-3">Loading...</div>;

  let isValidObservationId = false;

  if (
    currentObservationId &&
    data.observations.some(
      ({ id }: { id: string }) => id === currentObservationId,
    )
  ) {
    isValidObservationId = true;
  }

  const leftPanel =
    view === "hideTree" ? (
      <div className="flex h-full flex-col overflow-y-auto pl-4">
        {item.objectType === AnnotationQueueObjectType.TRACE ? (
          <TracePreview
            key={data.id}
            trace={data}
            scores={data.scores}
            observations={data.observations}
            viewType="focused"
          />
        ) : (
          <ObservationPreview
            observations={data.observations}
            scores={data.scores}
            projectId={item.projectId}
            currentObservationId={item.objectId}
            traceId={traceId}
            viewType="focused"
          />
        )}
      </div>
    ) : (
      <div className="flex h-full flex-col overflow-y-auto">
        <Trace
          key={data.id}
          trace={data}
          scores={data.scores}
          projectId={data.projectId}
          observations={data.observations}
          viewType="focused"
          isValidObservationId={isValidObservationId}
        />
      </div>
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
      onHasCommentDraftChange={onHasCommentDraftChange}
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
