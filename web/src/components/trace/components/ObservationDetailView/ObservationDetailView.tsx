/**
 * ObservationDetailView - adapter mapping the trace page/peek context onto
 * the consolidated TraceSidePanel presenter (variant "full").
 *
 * Responsibility:
 * - Read the trace contexts (TraceDataContext) and background-parsed
 *   observation I/O (useParsedObservation)
 * - Compute subtree metrics for root observations (v4 mode)
 * - Build the annotate drawer content (dual annotation in v4)
 * - Feed everything as props into TraceSidePanel
 *
 * The Scores tab + ScoresTable were removed per the consolidation decision
 * register — scores render in the panel's compact Scores accordion. With only
 * Preview left, the tabs machinery collapsed into the slim toolbar.
 */

import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { useMemo } from "react";
import { isGenerationLike } from "@langfuse/shared";
import { useMedia } from "@/src/components/trace/api/useMedia";

// Contexts and hooks
import { useTraceData } from "@/src/components/trace/contexts/TraceDataContext";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useParsedObservation } from "@/src/hooks/useParsedObservation";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import { api } from "@/src/utils/api";

import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import {
  aggregateTraceMetrics,
  getDescendantIds,
} from "@/src/components/trace/lib/trace-aggregation";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { TraceSidePanel } from "@/src/components/trace-side-panel/TraceSidePanel";

export interface ObservationDetailViewProps {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
  traceId: string;
}

export function ObservationDetailView({
  observation,
  projectId,
  traceId,
}: ObservationDetailViewProps) {
  const { isBetaEnabled: isV4Enabled } = useV4Beta();
  const {
    trace,
    observations,
    roots,
    nodeMap,
    comments,
    serverScores: scores,
    corrections,
  } = useTraceData();

  // for v4:
  // is this observation topmost in tree? we don't check for root observation here as this is not necessarily given.
  // Uses the tree's roots array which handles orphans correctly
  const treeNode = nodeMap.get(observation.id);
  const isRoot = roots.some((root) => root.id === observation.id);

  // For root observations, compute subtree metrics for badge tooltips.
  // We compute this lazily here rather than in tree-building.ts because:
  // - TreeNode.totalCost just has the aggregated cost, we use it
  // - costDetails/usageDetails (for tooltips) aren't in TreeNode, adding them causes high memory for all nodes, esp on big traces
  // - computation only runs when viewing a root observation and is memo'd
  const subtreeMetrics = useMemo(() => {
    if (!isRoot || !treeNode) return null;
    const descendantIds = getDescendantIds(treeNode);
    const descendantIdSet = new Set(descendantIds);

    const descendants = observations.filter((obs) =>
      descendantIdSet.has(obs.id),
    );
    const allObservations = [observation, ...descendants];
    return aggregateTraceMetrics(allObservations);
  }, [isRoot, treeNode, observations, observation]);

  const observationScores = useMemo(
    () => scores.filter((s) => s.observationId === observation.id),
    [scores, observation.id],
  );
  const traceScores = useMemo(
    () => scores.filter((s) => !s.observationId),
    [scores],
  );
  const observationCorrections = useMemo(
    () => corrections.filter((c) => c.observationId === observation.id),
    [corrections, observation.id],
  );
  const outputCorrection = getMostRecentCorrection(observationCorrections);

  // Fetch and parse observation input/output in background (Web Worker)
  // This combines tRPC fetch + non-blocking JSON parsing
  const {
    observation: observationWithIORaw,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    isLoadingObservation,
    isWaitingForParsing,
  } = useParsedObservation({
    observationId: observation.id,
    traceId: traceId,
    projectId: projectId,
    startTime: observation.startTime,
    baseObservation: observation,
  });

  // Type narrowing: when baseObservation is provided, result has full observation fields
  // (EventBatchIOOutput case only occurs when baseObservation is missing)
  const observationWithIO =
    observationWithIORaw && "type" in observationWithIORaw
      ? observationWithIORaw
      : undefined;

  // Fetch media for this observation
  const observationMedia = useMedia({
    projectId,
    traceId,
    observationId: observation.id,
  });

  const observationComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: observation.id,
      objectType: "OBSERVATION",
    },
    {
      refetchOnMount: false,
    },
  );

  const commentedPathsByField = useCommentedPaths(observationComments.data);

  const hasNonAnnotationScores = observationScores.some(
    (score) => score.source !== "ANNOTATION",
  );

  const annotateContent = isV4Enabled ? (
    <DualAnnotationContent
      projectId={projectId}
      traceId={traceId}
      observationId={observation.id}
      traceEnvironment={trace.environment}
      observationEnvironment={observation.environment}
      observationScores={observationScores}
      traceScores={traceScores}
    />
  ) : (
    <>
      <AnnotationForm
        serverScores={observationScores}
        scoreTarget={{
          type: "trace",
          traceId: traceId,
          observationId: observation.id,
        }}
        scoreMetadata={{
          projectId: projectId,
          environment: observation.environment,
        }}
        analyticsData={{ type: "trace", source: "TraceDetail" }}
      />
      {hasNonAnnotationScores && (
        <div className="text-muted-foreground mt-4 text-xs">
          API and eval scores visible on left. Add manual annotations above.
        </div>
      )}
    </>
  );

  return (
    <TraceSidePanel
      variant="full"
      projectId={projectId}
      traceId={traceId}
      observation={observation}
      io={{
        input: observationWithIO?.input ?? undefined,
        output: observationWithIO?.output ?? undefined,
        metadata: observationWithIO?.metadata ?? undefined,
        parsedInput,
        parsedOutput,
        parsedMetadata,
        isLoading: isLoadingObservation,
        isParsing: isWaitingForParsing,
        media: observationMedia.data,
      }}
      observationScores={observationScores}
      outputCorrection={outputCorrection}
      commentCount={comments.get(observation.id)}
      playgroundGeneration={
        observationWithIO && isGenerationLike(observationWithIO.type)
          ? observationWithIO
          : null
      }
      datasetPrefill={
        observationWithIO
          ? {
              input: observationWithIO.input,
              output: observationWithIO.output,
              metadata: observationWithIO.metadata,
            }
          : undefined
      }
      annotateContent={annotateContent}
      commentedPathsByField={commentedPathsByField}
      enableInlineComments={true}
      traceTags={
        isRoot && observation.traceTags && observation.traceTags.length > 0
          ? observation.traceTags
          : undefined
      }
      subtreeMetrics={subtreeMetrics}
      treeNodeTotalCost={treeNode?.totalCost}
    />
  );
}
