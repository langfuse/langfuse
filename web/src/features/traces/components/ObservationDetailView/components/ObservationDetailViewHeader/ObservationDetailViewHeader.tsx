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
  LangfuseInternalTraceEnvironment,
  type ScoreDomain,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import {
  ExistingDatasetItemsDropdownMenuController,
  NewDatasetItemFromExistingObjectDialogController,
  useDatasetItemFromTraceOrObservation,
} from "@/src/features/datasets";
import {
  AnnotateDrawerController,
  DualAnnotationContent,
} from "@/src/features/scores";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import {
  JumpToPlaygroundDropdownMenuController,
  useJumpToPlayground,
} from "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController";
import { JumpToPlaygroundMenu } from "@/src/features/playground/page/components/JumpToPlaygroundMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import {
  LatencyBadge,
  StartTimeBadge,
  TimeToFirstTokenBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { ObservationLevelBadge } from "@/src/features/traces/components/ObservationLevelBadge";
import { EvaluatorBadge } from "@/src/features/traces/components/ObservationDetailView/components/ObservationDetailViewHeader/components/EvaluatorBadge/EvaluatorBadge";
import { CostUsageBadge } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import type Decimal from "decimal.js";
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useReadPath } from "@/src/features/events";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import {
  ChevronDown,
  Database,
  EllipsisVertical,
  ListPlus,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  PlusIcon,
  SquarePen,
  Terminal,
} from "lucide-react";
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
import { useHasProjectAccess } from "@/src/features/rbac";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";
import { resolveEvaluatorIdMetadata } from "@/src/features/traces/fns/resolveEvaluatorIdMetadata";
import { api } from "@/src/utils/api";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";

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
  commentDrawerControl: {
    disabled: boolean;
    openDrawer: () => void;
  };
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
}

/** Chips shown before "+N". p50 of scored observations carries 2 scores, p90 4. */
const MAX_HEADER_SCORE_GROUPS = 3;

export const ObservationDetailViewHeader = memo(
  function ObservationDetailViewHeader({
    observation,
    observationWithIO,
    projectId,
    traceId,
    latencySeconds,
    observationScores,
    commentCount,
    commentDrawerControl,
    subtreeMetrics,
    treeNodeTotalCost,
  }: ObservationDetailViewHeaderProps) {
    const { isAnnotationMode } = useViewPreferences();
    const isMobile = useIsMobile();
    const { isV4: isV4Enabled } = useReadPath();
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
    const {
      existingDatasetItems,
      hasAccess: hasDatasetAccess,
      captureNewDatasetItemFormOpen,
    } = useDatasetItemFromTraceOrObservation({
      projectId,
      traceId,
      observationId: observation.id,
      enabled: Boolean(observationWithIO),
    });
    const datasetCount = existingDatasetItems.length;
    const hasExistingDatasetItems = datasetCount > 0;

    // Playground availability for the combined "Add to" menu. Only
    // generation-like observations offer the Playground entry — matching
    // that, gate the hook's internal API key query off for the rest so a
    // span/event doesn't fetch LLM API keys it will never use. The hook
    // itself must still run unconditionally (rules of hooks); without IO it
    // resolves to unavailable.
    const showPlaygroundEntry = Boolean(
      observationWithIO && isGenerationLike(observationWithIO.type),
    );
    const playground = useJumpToPlayground(
      {
        source: "generation",
        generation: observationWithIO ?? {
          ...observation,
          traceId: observation.traceId ?? null,
          input: null,
          output: null,
          metadata: null,
        },
        analyticsEventName: "trace_detail:test_in_playground_button_click",
      },
      { enabled: showPlaygroundEntry },
    );

    // Format cost and usage values
    const totalCost = observation.totalCost;
    const totalUsage = observation.totalUsage;
    const inputUsage = observation.inputUsage;
    const outputUsage = observation.outputUsage;
    const evaluatorId = resolveEvaluatorIdMetadata(
      observationWithIO?.metadata ?? observation.metadata,
    );
    const isEvaluatorExecution =
      observation.environment === LangfuseInternalTraceEnvironment.LLMJudge ||
      observation.environment === LangfuseInternalTraceEnvironment.CodeEval;
    const evaluator = api.evalsV2.get.useQuery(
      { projectId, evaluatorId: evaluatorId ?? "" },
      {
        enabled: Boolean(
          evaluatorId &&
          isEvaluatorExecution &&
          !evaluatorId.startsWith("managed:"),
        ),
      },
    );

    const displayedTotalCost = subtreeMetrics
      ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
      : totalCost;
    const displayedCostDetails =
      subtreeMetrics?.costDetails ?? observation.costDetails;
    // Usage only exists for generation-like observations — mirror that gate
    // here so a span/event's stray zero fields never masquerade as usage.
    const displayedInputUsage = subtreeMetrics
      ? subtreeMetrics.inputUsage
      : isGenerationLike(observation.type)
        ? inputUsage
        : 0;
    const displayedOutputUsage = subtreeMetrics
      ? subtreeMetrics.outputUsage
      : isGenerationLike(observation.type)
        ? outputUsage
        : 0;
    const displayedTotalUsage = subtreeMetrics
      ? subtreeMetrics.totalUsage
      : isGenerationLike(observation.type)
        ? totalUsage
        : 0;
    const displayedUsageDetails = subtreeMetrics
      ? subtreeMetrics.usageDetails
      : isGenerationLike(observation.type)
        ? observation.usageDetails
        : undefined;

    return (
      <div className="@container shrink-0 space-y-2 p-3">
        {/* Title row with actions */}
        <div className="flex w-full flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-auto flex-row items-center gap-1">
            <ItemBadge type={observation.type as ObservationType} />
            <span
              className={cn(
                "mb-0 min-w-0 truncate text-base font-bold",
                isMobile && "flex-1",
              )}
              title={observation.name || observation.id}
            >
              {observation.name || observation.id}
            </span>
            <DetailHeaderActionsMenuController
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
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    aria-label="Options"
                    className="mt-0.5 shrink-0"
                    size="icon-xs"
                    title="Options"
                    variant="ghost"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </Trigger>
              )}
            </DetailHeaderActionsMenuController>
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
                  // forceMount + hide-when-closed: CommentDrawerController lives in
                  // here, and its deep-link auto-open effect (?comments=open) and
                  // controlled inline-selection flow only work while mounted. A
                  // default Popover unmounts its content when closed (the default
                  // state), silently breaking both. Keep it mounted, just hidden.
                  forceMount
                  className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
                >
                  {observationWithIO && (
                    <NewDatasetItemFromExistingObjectDialogController
                      projectId={projectId}
                    >
                      {({ openDialog }) => (
                        <ExistingDatasetItemsDropdownMenuController
                          projectId={projectId}
                          datasetItems={existingDatasetItems}
                          disabled={!hasDatasetAccess}
                          onOpenDialog={() =>
                            openDialog({
                              traceId,
                              observationId: observation.id,
                              input: observationWithIO.input,
                              output: observationWithIO.output,
                              metadata: observationWithIO.metadata,
                            })
                          }
                        >
                          {({ Anchor, openDropdown }) => (
                            <Anchor>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!hasDatasetAccess}
                                className="w-full justify-start gap-2 font-normal"
                                onClick={() => {
                                  if (hasExistingDatasetItems) {
                                    openDropdown();
                                    return;
                                  }

                                  captureNewDatasetItemFormOpen();
                                  openDialog({
                                    traceId,
                                    observationId: observation.id,
                                    input: observationWithIO.input,
                                    output: observationWithIO.output,
                                    metadata: observationWithIO.metadata,
                                  });
                                }}
                              >
                                {hasExistingDatasetItems || hasDatasetAccess ? (
                                  <PlusIcon
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <span className="text-sm">
                                  {hasExistingDatasetItems
                                    ? `In ${datasetCount} dataset(s)`
                                    : "Add to datasets"}
                                </span>
                                {hasExistingDatasetItems ? (
                                  <ChevronDown className="ml-auto h-3 w-3" />
                                ) : !hasDatasetAccess ? (
                                  <LockIcon
                                    className="ml-auto h-3 w-3"
                                    aria-hidden="true"
                                  />
                                ) : null}
                              </Button>
                            </Anchor>
                          )}
                        </ExistingDatasetItemsDropdownMenuController>
                      )}
                    </NewDatasetItemFromExistingObjectDialogController>
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
                        <AnnotateDrawerController projectId={projectId}>
                          {({ disabled, openDrawer }) => (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              className="w-full justify-start gap-2 font-normal"
                              onClick={() =>
                                openDrawer({
                                  scoreTarget: {
                                    type: "trace",
                                    traceId,
                                    observationId: observation.id,
                                  },
                                  scores: observationScores,
                                  analyticsData: {
                                    type: "trace",
                                    source: "TraceDetail",
                                  },
                                  scoreMetadata: {
                                    projectId,
                                    environment: observation.environment,
                                  },
                                })
                              }
                            >
                              {disabled ? (
                                <LockIcon className="h-3 w-3" />
                              ) : (
                                <SquarePen className="h-4 w-4" />
                              )}
                              <span className="text-sm">Annotate</span>
                            </Button>
                          )}
                        </AnnotateDrawerController>
                      )}
                      <AnnotationQueueItemDropdownMenuController
                        projectId={projectId}
                        objectId={observation.id}
                        objectType={AnnotationQueueObjectType.OBSERVATION}
                      >
                        {({ disabled, totalCount }) => (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={disabled !== undefined}
                            className="w-full justify-start gap-2 font-normal"
                          >
                            <ListPlus className="h-4 w-4" />
                            <span className="text-sm">Add to queue</span>
                            {totalCount > 0 && (
                              <AnnotationQueueItemCountBadge
                                totalCount={totalCount}
                                layout="menu"
                              />
                            )}
                          </Button>
                        )}
                      </AnnotationQueueItemDropdownMenuController>
                    </>
                  )}
                  {observationWithIO &&
                    isGenerationLike(observationWithIO.type) && (
                      <JumpToPlaygroundDropdownMenuController
                        source="generation"
                        generation={observationWithIO}
                        analyticsEventName="trace_detail:test_in_playground_button_click"
                      >
                        {({ Trigger, disabled, title }) => (
                          <Trigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              title={title}
                              className={cn(
                                "w-full justify-start gap-2 font-normal",
                                disabled
                                  ? "cursor-not-allowed opacity-50"
                                  : "cursor-pointer",
                              )}
                            >
                              <Terminal className="h-4 w-4" />
                              <span className="text-sm">
                                Test in playground
                              </span>
                            </Button>
                          </Trigger>
                        )}
                      </JumpToPlaygroundDropdownMenuController>
                    )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={commentDrawerControl.disabled}
                    onClick={commentDrawerControl.openDrawer}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    {commentDrawerControl.disabled ? (
                      <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    <span className="text-sm">Comment</span>
                    {!commentDrawerControl.disabled && commentCount ? (
                      <ActionButtonCountBadge count={commentCount} />
                    ) : null}
                  </Button>
                </PopoverContent>
              </Popover>
            )}
          </div>
          {/* Action buttons (desktop inline cluster) */}
          {!isMobile && (
            <div className="flex flex-wrap content-start items-start gap-0.5">
              {observationWithIO && (
                <NewDatasetItemFromExistingObjectDialogController
                  projectId={projectId}
                  key={observation.id}
                >
                  {({ openDialog }) => (
                    <ExistingDatasetItemsDropdownMenuController
                      projectId={projectId}
                      datasetItems={existingDatasetItems}
                      disabled={!hasDatasetAccess}
                      onOpenDialog={() =>
                        openDialog({
                          traceId,
                          observationId: observation.id,
                          input: observationWithIO.input,
                          output: observationWithIO.output,
                          metadata: observationWithIO.metadata,
                        })
                      }
                    >
                      {({ Anchor, openDropdown }) => (
                        // One "Add to" menu for the send-this-somewhere verbs
                        // (dataset, playground). Anchor must wrap only the
                        // real DOM trigger, not this whole DropdownMenu: the
                        // menu root is a context provider with no DOM node of
                        // its own, so anchoring it left the existing-items
                        // menu anchorless whenever the observation already
                        // had dataset items.
                        <DropdownMenu>
                          <Anchor>
                            <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="sm">
                                <PlusIcon
                                  className="mr-1.5 -ml-0.5 h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Add to
                              </Button>
                            </DropdownMenuTrigger>
                          </Anchor>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!hasDatasetAccess}
                              onSelect={() => {
                                if (hasExistingDatasetItems) {
                                  openDropdown();
                                  return;
                                }
                                captureNewDatasetItemFormOpen();
                                openDialog({
                                  traceId,
                                  observationId: observation.id,
                                  input: observationWithIO.input,
                                  output: observationWithIO.output,
                                  metadata: observationWithIO.metadata,
                                });
                              }}
                            >
                              <Database className="mr-2 h-4 w-4" />
                              {hasExistingDatasetItems
                                ? `Dataset — in ${datasetCount}`
                                : "Dataset"}
                              {!hasDatasetAccess && (
                                <LockIcon className="ml-auto h-3 w-3" />
                              )}
                            </DropdownMenuItem>
                            {showPlaygroundEntry && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger
                                  disabled={!playground.isAvailable}
                                  title={playground.tooltipMessage}
                                >
                                  <Terminal className="mr-2 h-4 w-4" />
                                  Playground
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <JumpToPlaygroundMenu
                                    source="generation"
                                    includeOutput={playground.includeOutput}
                                    onIncludeOutputChange={
                                      playground.setIncludeOutput
                                    }
                                    onPlaygroundAction={
                                      playground.handlePlaygroundAction
                                    }
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </ExistingDatasetItemsDropdownMenuController>
                  )}
                </NewDatasetItemFromExistingObjectDialogController>
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
                    <AnnotateDrawerController projectId={projectId}>
                      {({ disabled, openDrawer }) => (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          className="rounded-r-none"
                          onClick={() =>
                            openDrawer({
                              scoreTarget: {
                                type: "trace",
                                traceId,
                                observationId: observation.id,
                              },
                              scores: observationScores,
                              analyticsData: {
                                type: "trace",
                                source: "TraceDetail",
                              },
                              scoreMetadata: {
                                projectId,
                                environment: observation.environment,
                              },
                            })
                          }
                        >
                          {disabled ? (
                            <LockIcon className="mr-1.5 h-3 w-3" />
                          ) : (
                            <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          <span>Annotate</span>
                        </Button>
                      )}
                    </AnnotateDrawerController>
                  )}
                  <AnnotationQueueItemDropdownMenuController
                    projectId={projectId}
                    objectId={observation.id}
                    objectType={AnnotationQueueObjectType.OBSERVATION}
                  >
                    {({ disabled, totalCount }) => (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={disabled !== undefined}
                        className="rounded-l-none rounded-r-md border-l px-1.5"
                      >
                        <span className="relative text-xs">
                          <ChevronDown className="h-3 w-3" />
                          {totalCount > 0 && (
                            <AnnotationQueueItemCountBadge
                              totalCount={totalCount}
                              layout="toolbar"
                            />
                          )}
                        </span>
                      </Button>
                    )}
                  </AnnotationQueueItemDropdownMenuController>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={commentDrawerControl.disabled}
                onClick={commentDrawerControl.openDrawer}
                className="gap-1"
              >
                {commentDrawerControl.disabled ? (
                  <MessageSquareOff className="text-muted-foreground h-3.5 w-3.5" />
                ) : (
                  <>
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Comment</span>
                    {!!commentCount ? (
                      <ActionButtonCountBadge count={commentCount} />
                    ) : null}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {/* Metrics row: measured numbers plus specialty badges (level,
              evaluator, prompt) that stay next to them. Session/user render
              once in the TraceSummaryStrip — in v4 every observation carries
              the trace's values. */}
          {!isAnnotationMode && (
            <CollapsibleBadgeRow>
              <StartTimeBadge startTime={observation.startTime} />
              <LatencyBadge latencySeconds={latencySeconds} />
              <TimeToFirstTokenBadge
                timeToFirstToken={observation.timeToFirstToken}
              />
              <CostUsageBadge
                totalCost={displayedTotalCost}
                costDetails={displayedCostDetails}
                inputUsage={displayedInputUsage}
                outputUsage={displayedOutputUsage}
                totalUsage={displayedTotalUsage}
                usageDetails={displayedUsageDetails}
              />
              {evaluatorId &&
                isEvaluatorExecution &&
                !evaluatorId.startsWith("managed:") && (
                  <EvaluatorBadge
                    evaluatorId={evaluatorId}
                    evaluatorName={evaluator.data?.name}
                    projectId={projectId}
                  />
                )}
              {observation.level !== "DEFAULT" && (
                <ObservationLevelBadge
                  level={observation.level}
                  size="default"
                />
              )}
              {observation.promptId && (
                <PromptBadge
                  promptId={observation.promptId}
                  projectId={projectId}
                />
              )}
            </CollapsibleBadgeRow>
          )}
          {/* Scores as chips, capped like the tree rows: three names inline,
              "+N" opens the full list. The Scores tab keeps the table. */}
          {observationScores.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <GroupedScoreBadges
                scores={observationScores}
                compact
                maxVisible={MAX_HEADER_SCORE_GROUPS}
              />
            </div>
          )}
        </div>
      </div>
    );
  },
);
