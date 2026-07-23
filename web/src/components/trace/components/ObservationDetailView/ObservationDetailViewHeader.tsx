/**
 * ObservationDetailViewHeader - Extracted header component for ObservationDetailView
 *
 * Contains:
 * - Title row with type chip, observation name + mono timestamp, actions menu
 * - Action buttons (Dataset, Annotate, Queue, Playground, Comments)
 * - Overview metrics grid (latency, environment, cost, usage, model, etc.)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useMemo } from "react";
import { AnnotationQueueObjectType, isGenerationLike } from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  OverviewGrid,
  TypeChip,
} from "@/src/components/trace/components/_shared/InspectorElements";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { AddToDropdownMenu } from "@/src/components/trace/components/_shared/AddToDropdownMenu";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { PromptBadge } from "@/src/components/trace/components/_shared/PromptBadge";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
  EnvironmentBadge,
  VersionBadge,
  LevelBadge,
  StatusMessageBadge,
} from "./ObservationMetadataBadgesSimple";
import {
  SessionBadge,
  UserIdBadge,
} from "../TraceDetailView/TraceMetadataBadges";
import { CostBadge, UsageBadge } from "./ObservationMetadataBadgesTooltip";
import { ModelBadge } from "./ObservationMetadataBadgeModel";
import { ModelParametersBadges } from "./ObservationMetadataBadgeModelParameters";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { type ScoreDomain } from "@langfuse/shared";
import { type AggregatedTraceMetrics } from "@/src/components/trace/lib/trace-aggregation";
import type Decimal from "decimal.js";
import { DetailHeaderActionsMenu } from "@/src/components/trace/components/_shared/DetailHeaderActionsMenu";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useTraceData } from "@/src/components/trace/contexts/TraceDataContext";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";

export interface ObservationDetailViewHeaderProps {
  observation: ObservationReturnTypeWithMetadata;
  observationWithIO:
    | (Omit<ObservationReturnTypeWithMetadata, "traceId" | "metadata"> & {
        traceId: string | null;
        input: string | null;
        output: string | null;
        metadata: MetadataDomainClient;
      })
    | undefined;
  projectId: string;
  traceId: string;
  latencySeconds: number | null;
  observationScores: WithStringifiedMetadata<ScoreDomain>[];
  commentCount: number | undefined;
  // Inline comment props
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  isCommentDrawerOpen?: boolean;
  onCommentDrawerOpenChange?: (open: boolean) => void;
  // Annotate drawer is view-owned so the Scores accordion can open it too
  isAnnotateDrawerOpen: boolean;
  onAnnotateDrawerOpenChange: (open: boolean) => void;
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
}

export const ObservationDetailViewHeader = memo(
  function ObservationDetailViewHeader({
    observation,
    observationWithIO,
    projectId,
    traceId,
    latencySeconds,
    observationScores,
    commentCount,
    pendingSelection,
    onSelectionUsed,
    isCommentDrawerOpen,
    onCommentDrawerOpenChange,
    isAnnotateDrawerOpen,
    onAnnotateDrawerOpenChange,
    subtreeMetrics,
    treeNodeTotalCost,
  }: ObservationDetailViewHeaderProps) {
    const { isAnnotationMode } = useViewPreferences();
    const { isBetaEnabled: isV4Enabled } = useV4Beta();
    const { trace, serverScores } = useTraceData();

    // Get trace-level scores for V4 dual annotation
    const traceScores = useMemo(
      () => serverScores.filter((s) => !s.observationId),
      [serverScores],
    );

    const hasNonAnnotationScores = observationScores.some(
      (score) => score.source !== "ANNOTATION",
    );

    // Format cost and usage values
    const totalCost = observation.totalCost;
    const totalUsage = observation.totalUsage;
    const inputUsage = observation.inputUsage;
    const outputUsage = observation.outputUsage;

    return (
      <div className="@container shrink-0 space-y-3 p-3 pb-2.5">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-start gap-2">
            <TypeChip type={observation.type} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 min-w-0 text-sm font-bold break-all md:break-normal md:wrap-break-word">
                {observation.name || observation.id}
              </div>
              <LocalIsoDate
                date={observation.startTime}
                accuracy="millisecond"
                className="text-muted-foreground font-mono text-[10px]"
              />
            </div>
          </div>
          {/* Action buttons — grouped per the inspector design */}
          <div className="flex h-full flex-wrap content-start items-center justify-start gap-1 @2xl:mr-1 @2xl:justify-end">
            {observationWithIO && isGenerationLike(observationWithIO.type) && (
              <JumpToPlaygroundButton
                source="generation"
                generation={observationWithIO}
                analyticsEventName="trace_detail:test_in_playground_button_click"
                variant="outline"
                size="sm"
                className="md:hidden"
              />
            )}
            <AddToDropdownMenu
              projectId={projectId}
              traceId={traceId}
              observationId={observation.id}
              datasetPrefill={
                observationWithIO
                  ? {
                      input: observationWithIO.input,
                      output: observationWithIO.output,
                      metadata: observationWithIO.metadata,
                    }
                  : undefined
              }
              annotateContent={
                isV4Enabled ? (
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
                        API and eval scores visible on left. Add manual
                        annotations above.
                      </div>
                    )}
                  </>
                )
              }
              isAnnotateDrawerOpen={isAnnotateDrawerOpen}
              onAnnotateDrawerOpenChange={onAnnotateDrawerOpenChange}
              hasExistingScores={observationScores.length > 0}
              showAnnotate={!isAnnotationMode}
              onOpenComments={() => onCommentDrawerOpenChange?.(true)}
              commentCount={commentCount}
            />
            {/* Annotation-queue toggles need their own checkbox dropdown, so
                this stays a compact chevron button next to the menu. */}
            {!isAnnotationMode && (
              <div className="[&>button]:h-7 [&>button]:rounded-md [&>button]:border-l">
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={observation.id}
                  objectType={AnnotationQueueObjectType.OBSERVATION}
                  variant="outline"
                  size="sm"
                />
              </div>
            )}
            <DetailHeaderActionsMenu
              idItems={[
                { id: traceId, name: "Trace ID" },
                { id: observation.id, name: "Observation ID" },
              ]}
              observationType={observation.type}
              projectId={projectId}
              spanName={observation.name ?? ""}
              webCallout={{
                traceId,
                observationId: observation.id,
                sessionId: observation.sessionId ?? null,
              }}
            />
            {/* Hidden host for the comment drawer: keeps deep-link auto-open
                (?comments=open) and inline-comment selection wiring intact;
                opened from the "Add comment" menu item via controlled state. */}
            <span className="hidden">
              <CommentDrawerButton
                projectId={projectId}
                objectId={observation.id}
                objectType="OBSERVATION"
                count={commentCount}
                size="sm"
                pendingSelection={pendingSelection}
                onSelectionUsed={onSelectionUsed}
                isOpen={isCommentDrawerOpen}
                onOpenChange={onCommentDrawerOpenChange}
              />
            </span>
          </div>
        </div>

        {/* Overview metrics grid */}
        {!isAnnotationMode && (
          <OverviewGrid>
            <LatencyBadge latencySeconds={latencySeconds} />
            <TimeToFirstTokenBadge
              timeToFirstToken={observation.timeToFirstToken}
            />
            <EnvironmentBadge environment={observation.environment} />
            <UserIdBadge
              userId={observation.userId ?? null}
              projectId={projectId}
            />
            <SessionBadge
              sessionId={observation.sessionId ?? null}
              projectId={projectId}
            />
            <CostBadge
              totalCost={
                subtreeMetrics
                  ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
                  : totalCost
              }
              costDetails={
                subtreeMetrics?.costDetails ?? observation.costDetails
              }
            />
            {subtreeMetrics ? (
              subtreeMetrics.hasGenerationLike &&
              subtreeMetrics.usageDetails && (
                <UsageBadge
                  type="GENERATION"
                  inputUsage={subtreeMetrics.inputUsage}
                  outputUsage={subtreeMetrics.outputUsage}
                  totalUsage={subtreeMetrics.totalUsage}
                  usageDetails={subtreeMetrics.usageDetails}
                />
              )
            ) : (
              <UsageBadge
                type={observation.type}
                inputUsage={inputUsage}
                outputUsage={outputUsage}
                totalUsage={totalUsage}
                usageDetails={observation.usageDetails}
              />
            )}
            <ModelBadge
              model={observation.model}
              internalModelId={observation.internalModelId}
              projectId={projectId}
              usageDetails={observation.usageDetails}
            />
            <ModelParametersBadges
              modelParameters={observation.modelParameters}
            />
            {observation.promptId && (
              <PromptBadge
                promptId={observation.promptId}
                projectId={projectId}
              />
            )}
            <VersionBadge version={observation.version} />
            <LevelBadge level={observation.level} />
            <StatusMessageBadge statusMessage={observation.statusMessage} />
          </OverviewGrid>
        )}
      </div>
    );
  },
);
