/**
 * ObservationDetailViewHeader - Extracted header component for ObservationDetailView
 *
 * Contains:
 * - Title row with ItemBadge, observation name, options menu
 * - Action buttons (Dataset, Annotate, Queue, Playground, Comments)
 * - Metadata badges (timestamp, latency, environment, cost, usage, model, etc.)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useMemo } from "react";
import {
  type ObservationType,
  AnnotationQueueObjectType,
  isGenerationLike,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
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
import { Button } from "@/src/components/ui/button";
import { LockIcon, MoreHorizontal, SquarePen } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { CollapsibleBadgeRow } from "@/src/components/trace/components/_shared/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";

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
    subtreeMetrics,
    treeNodeTotalCost,
  }: ObservationDetailViewHeaderProps) {
    const { isAnnotationMode } = useViewPreferences();
    const isMobile = useIsMobile();
    const { isBetaEnabled: isV4Enabled } = useV4Beta();
    const { trace, serverScores } = useTraceData();

    // Get trace-level scores for V4 dual annotation
    const traceScores = useMemo(
      () => serverScores.filter((s) => !s.observationId),
      [serverScores],
    );

    // Access check for annotation drawer
    const hasAnnotationAccess = useHasProjectAccess({
      projectId,
      scope: "scores:CUD",
    });

    // Format cost and usage values
    const totalCost = observation.totalCost;
    const totalUsage = observation.totalUsage;
    const inputUsage = observation.inputUsage;
    const outputUsage = observation.outputUsage;

    return (
      <div className="@container shrink-0 space-y-2 border-b p-2">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-center gap-1">
            <ItemBadge type={observation.type as ObservationType} isSmall />
            <span
              className={cn(
                "mb-0 line-clamp-2 min-w-0 font-bold break-all md:break-normal md:wrap-break-word",
                isMobile && "flex-1",
              )}
            >
              {observation.name || observation.id}
            </span>
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
            {/* Mobile: collapse the action-button cluster into a `⋯` overflow of
                full-width labeled rows, next to the `⋮` utility menu. */}
            {isMobile && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    className="ml-auto shrink-0"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  // forceMount + hide-when-closed: CommentDrawerButton lives in
                  // here, and its deep-link auto-open effect (?comments=open) and
                  // controlled inline-selection flow only work while mounted. A
                  // default Popover unmounts its content when closed (the default
                  // state), silently breaking both. Keep it mounted, just hidden.
                  forceMount
                  className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
                >
                  {observationWithIO && (
                    <NewDatasetItemFromExistingObject
                      traceId={traceId}
                      observationId={observation.id}
                      projectId={projectId}
                      input={observationWithIO.input}
                      output={observationWithIO.output}
                      metadata={observationWithIO.metadata}
                      layout="menu"
                    />
                  )}
                  {!isAnnotationMode && (
                    <>
                      {isV4Enabled ? (
                        <Drawer
                          key={"annotation-drawer-menu-" + observation.id}
                        >
                          <DrawerTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!hasAnnotationAccess}
                              className="w-full justify-start gap-2 font-normal"
                            >
                              {!hasAnnotationAccess ? (
                                <LockIcon className="h-3 w-3" />
                              ) : (
                                <SquarePen className="h-4 w-4" />
                              )}
                              <span className="text-sm">Annotate</span>
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="p-3">
                            <DualAnnotationContent
                              projectId={projectId}
                              traceId={traceId}
                              observationId={observation.id}
                              traceEnvironment={trace.environment}
                              observationEnvironment={observation.environment}
                              observationScores={observationScores}
                              traceScores={traceScores}
                            />
                          </DrawerContent>
                        </Drawer>
                      ) : (
                        <AnnotateDrawer
                          key={"annotation-drawer-menu-" + observation.id}
                          projectId={projectId}
                          scoreTarget={{
                            type: "trace",
                            traceId: traceId,
                            observationId: observation.id,
                          }}
                          scores={observationScores}
                          scoreMetadata={{
                            projectId: projectId,
                            environment: observation.environment,
                          }}
                          layout="menu"
                        />
                      )}
                      <CreateNewAnnotationQueueItem
                        projectId={projectId}
                        objectId={observation.id}
                        objectType={AnnotationQueueObjectType.OBSERVATION}
                        layout="menu"
                      />
                    </>
                  )}
                  {observationWithIO &&
                    isGenerationLike(observationWithIO.type) && (
                      <JumpToPlaygroundButton
                        source="generation"
                        generation={observationWithIO}
                        analyticsEventName="trace_detail:test_in_playground_button_click"
                        layout="menu"
                      />
                    )}
                  <CommentDrawerButton
                    projectId={projectId}
                    objectId={observation.id}
                    objectType="OBSERVATION"
                    count={commentCount}
                    layout="menu"
                    pendingSelection={pendingSelection}
                    onSelectionUsed={onSelectionUsed}
                    isOpen={isCommentDrawerOpen}
                    onOpenChange={onCommentDrawerOpenChange}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
          {/* Action buttons (desktop inline cluster) */}
          {!isMobile && (
            <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
              {observationWithIO && (
                <NewDatasetItemFromExistingObject
                  traceId={traceId}
                  observationId={observation.id}
                  projectId={projectId}
                  input={observationWithIO.input}
                  output={observationWithIO.output}
                  metadata={observationWithIO.metadata}
                  key={observation.id}
                  size="sm"
                />
              )}
              {/* Hide annotation buttons in annotation mode (panel shown separately) */}
              {!isAnnotationMode && (
                <div className="flex items-start">
                  {isV4Enabled ? (
                    <Drawer key={"annotation-drawer-" + observation.id}>
                      <DrawerTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!hasAnnotationAccess}
                          className="rounded-r-none"
                        >
                          {!hasAnnotationAccess ? (
                            <LockIcon className="mr-1.5 h-3 w-3" />
                          ) : (
                            <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          <span>Annotate</span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="p-3">
                        <DualAnnotationContent
                          projectId={projectId}
                          traceId={traceId}
                          observationId={observation.id}
                          traceEnvironment={trace.environment}
                          observationEnvironment={observation.environment}
                          observationScores={observationScores}
                          traceScores={traceScores}
                        />
                      </DrawerContent>
                    </Drawer>
                  ) : (
                    <AnnotateDrawer
                      key={"annotation-drawer-" + observation.id}
                      projectId={projectId}
                      scoreTarget={{
                        type: "trace",
                        traceId: traceId,
                        observationId: observation.id,
                      }}
                      scores={observationScores}
                      scoreMetadata={{
                        projectId: projectId,
                        environment: observation.environment,
                      }}
                      size="sm"
                    />
                  )}
                  <CreateNewAnnotationQueueItem
                    projectId={projectId}
                    objectId={observation.id}
                    objectType={AnnotationQueueObjectType.OBSERVATION}
                    size="sm"
                  />
                </div>
              )}
              {observationWithIO &&
                isGenerationLike(observationWithIO.type) && (
                  <JumpToPlaygroundButton
                    source="generation"
                    generation={observationWithIO}
                    analyticsEventName="trace_detail:test_in_playground_button_click"
                    size="sm"
                  />
                )}
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
            </div>
          )}
        </div>

        {/* Metadata badges */}

        <div className="flex flex-col gap-2">
          {/* Timestamp */}
          <div className="flex flex-wrap items-center gap-1">
            <LocalIsoDate
              date={observation.startTime}
              accuracy="millisecond"
              className="text-sm"
            />
          </div>

          {/* Other badges */}
          {!isAnnotationMode && (
            <CollapsibleBadgeRow>
              <LatencyBadge latencySeconds={latencySeconds} />
              <TimeToFirstTokenBadge
                timeToFirstToken={observation.timeToFirstToken}
              />
              <SessionBadge
                sessionId={observation.sessionId ?? null}
                projectId={projectId}
              />
              <UserIdBadge
                userId={observation.userId ?? null}
                projectId={projectId}
              />
              <EnvironmentBadge environment={observation.environment} />
              <CostBadge
                totalCost={
                  subtreeMetrics
                    ? (treeNodeTotalCost?.toNumber() ??
                      subtreeMetrics.totalCost)
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
              <VersionBadge version={observation.version} />
              <ModelBadge
                model={observation.model}
                internalModelId={observation.internalModelId}
                projectId={projectId}
                usageDetails={observation.usageDetails}
              />
              <ModelParametersBadges
                modelParameters={observation.modelParameters}
              />
              <LevelBadge level={observation.level} />
              <StatusMessageBadge statusMessage={observation.statusMessage} />
              {observation.promptId && (
                <PromptBadge
                  promptId={observation.promptId}
                  projectId={projectId}
                />
              )}
            </CollapsibleBadgeRow>
          )}
        </div>
      </div>
    );
  },
);
