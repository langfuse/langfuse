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
import { api } from "@/src/utils/api";
import { castToNumberMap } from "@/src/utils/map-utils";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";

interface TraceAnnotationProcessorProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  data: any; // Trace data with observations and scores
  view: "showTree" | "hideTree";
  configs: ScoreConfigDomain[];
  projectId: string;
}

export const TraceAnnotationProcessor: React.FC<
  TraceAnnotationProcessorProps
> = ({ item, data, view, configs, projectId }) => {
  const traceId = item.parentTraceId ?? item.objectId;

  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);

  const traceCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId: projectId,
      objectId: traceId,
      objectType: "TRACE",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  const observationCommentCounts = api.comments.getCountByObjectType.useQuery(
    {
      projectId: projectId,
      objectType: "OBSERVATION",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember,
    },
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
            serverScores={data.scores}
            observations={data.observations}
            viewType="focused"
            showCommentButton={true}
            commentCounts={castToNumberMap(traceCommentCounts.data)}
          />
        ) : (
          <ObservationPreview
            observations={data.observations}
            serverScores={data.scores}
            projectId={item.projectId}
            currentObservationId={item.objectId}
            traceId={traceId}
            viewType="focused"
            showCommentButton={true}
            commentCounts={castToNumberMap(observationCommentCounts.data)}
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
