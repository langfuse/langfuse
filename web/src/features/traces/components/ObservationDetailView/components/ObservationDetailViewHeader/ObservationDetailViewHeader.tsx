/**
 * ObservationDetailViewHeader - Extracted header component for ObservationDetailView
 *
 * Contains:
 * - Title row with ItemBadge, observation name, options menu
 * - Action buttons (Add to, Annotate, Comment)
 * - Metadata badges (timestamp, latency, environment, cost, usage, model, etc.)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useMemo, useState } from "react";
import {
  type ObservationType,
  isGenerationLike,
  LangfuseInternalTraceEnvironment,
  type ScoreDomain,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import { AnnotateDrawerController } from "@/src/features/scores";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { ObservationLevelBadge } from "@/src/features/traces/components/ObservationLevelBadge";
import { EvaluatorBadge } from "@/src/features/traces/components/ObservationDetailView/components/ObservationDetailViewHeader/components/EvaluatorBadge/EvaluatorBadge";
import {
  CostBadge,
  UsageBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { resolveObservationCostSource } from "@/src/features/traces/components/ObservationDetailView/components/ObservationDetailViewHeader/costSource";
import { ModelBadge } from "@/src/features/traces/components/ObservationDetailView/components/ModelBadge";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import type Decimal from "decimal.js";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useReadPath } from "@/src/features/events";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import {
  ChevronDown,
  EllipsisVertical,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  PlusIcon,
  SquarePen,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";
import { resolveEvaluatorIdMetadata } from "@/src/features/traces/fns/resolveEvaluatorIdMetadata";
import { api } from "@/src/utils/api";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

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
    const [isMobileActionsOpen, setMobileActionsOpen] = useState(false);
    const { isV4: isV4Enabled } = useReadPath();
    const { trace, serverScores } = useTraceData();

    // Get trace-level scores for V4 dual annotation
    const traceScores = useMemo(
      () => serverScores.filter((s) => !s.observationId),
      [serverScores],
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

    const preparedDate = buildLocalIsoDatePresentation({
      date: observation.startTime,
      accuracy: "millisecond",
    });
    const displayedTotalCost = subtreeMetrics
      ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
      : totalCost;
    const displayedCostDetails =
      subtreeMetrics?.costDetails ?? observation.costDetails;
    const showsOwnObservationCost = !subtreeMetrics;
    const hasProvidedCostDetails =
      Object.keys(observation.providedCostDetails).length > 0;
    const costSource = resolveObservationCostSource({
      hasSubtreeMetrics: Boolean(subtreeMetrics),
      hasProvidedCostDetails,
    });
    const priceSource =
      isGenerationLike(observation.type) &&
      observation.internalModelId &&
      observation.model &&
      observation.usagePricingTierId &&
      observation.usagePricingTierName &&
      !hasProvidedCostDetails &&
      showsOwnObservationCost
        ? {
            projectId,
            modelId: observation.internalModelId,
            modelName: observation.model,
            pricingTierId: observation.usagePricingTierId,
            pricingTierName: observation.usagePricingTierName,
          }
        : undefined;

    return (
      <div className="@container shrink-0 space-y-2 border-b p-2">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex w-full min-w-0 flex-row items-center gap-1">
            <ItemBadge type={observation.type as ObservationType} isSmall />
            <span
              className={cn(
                "mb-0 min-w-0 truncate font-bold",
                isMobile && "flex-1",
              )}
              title={observation.name || observation.id}
            >
              {observation.name || observation.id}
            </span>
            {/* Mobile: collapse the action-button cluster into a `⋯` overflow of
                full-width labeled rows, next to the `⋮` utility menu. */}
            {isMobile && (
              <ConnectedTraceObservationAddToDropdownMenuController
                analyticsData={{ source: "TraceDetail", isV4: isV4Enabled }}
                projectId={projectId}
                traceId={traceId}
                variant="observation"
                observationId={observation.id}
                input={observationWithIO?.input ?? null}
                output={observationWithIO?.output ?? null}
                metadata={observationWithIO?.metadata ?? null}
                generation={
                  observationWithIO && isGenerationLike(observationWithIO.type)
                    ? observationWithIO
                    : undefined
                }
              >
                {({ getTriggerProps }) => (
                  <AnnotateDrawerController projectId={projectId}>
                    {({ disabled: annotationDisabled, openDrawer }) => (
                      <Popover
                        open={isMobileActionsOpen}
                        onOpenChange={setMobileActionsOpen}
                      >
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
                          onFocusOutside={(event) => {
                            // Keep the anchor mounted while a portaled action menu takes focus.
                            event.preventDefault();
                          }}
                          className="flex w-auto min-w-44 flex-col gap-0.5 p-1"
                        >
                          {observationWithIO && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 font-normal"
                              {...getTriggerProps()}
                            >
                              <PlusIcon className="h-4 w-4" />
                              <span>Add to</span>
                              <ChevronDown className="ml-auto h-3 w-3" />
                            </Button>
                          )}
                          {!isAnnotationMode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={annotationDisabled}
                              className="w-full justify-start gap-2 font-normal"
                              onClick={() => {
                                setMobileActionsOpen(false);
                                openDrawer({
                                  scoreTarget: {
                                    type: "trace",
                                    traceId,
                                    observationId: observation.id,
                                  },
                                  scores: observationScores,
                                  companionTrace: isV4Enabled
                                    ? {
                                        environment: trace.environment,
                                        scores: traceScores,
                                      }
                                    : undefined,
                                  analyticsData: {
                                    type: "trace",
                                    source: "TraceDetail",
                                    isV4: isV4Enabled,
                                  },
                                  scoreMetadata: {
                                    projectId,
                                    environment: observation.environment,
                                  },
                                });
                              }}
                            >
                              {annotationDisabled ? (
                                <LockIcon className="h-3 w-3" />
                              ) : (
                                <SquarePen className="h-4 w-4" />
                              )}
                              <span className="text-sm">Annotate</span>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={commentDrawerControl.disabled}
                            onClick={() => {
                              setMobileActionsOpen(false);
                              commentDrawerControl.openDrawer();
                            }}
                            className="w-full justify-start gap-2 font-normal"
                          >
                            {commentDrawerControl.disabled ? (
                              <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                            ) : (
                              <MessageSquare className="h-4 w-4" />
                            )}
                            <span className="text-sm">Add comment</span>
                            {!commentDrawerControl.disabled && commentCount ? (
                              <ActionButtonCountBadge count={commentCount} />
                            ) : null}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    )}
                  </AnnotateDrawerController>
                )}
              </ConnectedTraceObservationAddToDropdownMenuController>
            )}
            {isMobile && (
              <ConnectedDetailHeaderActionsMenuController
                idItems={[
                  { id: traceId, name: "Trace ID" },
                  { id: observation.id, name: "Observation ID" },
                ]}
                observationType={observation.type}
                projectId={projectId}
                observation={
                  isV4Enabled
                    ? {
                        id: observation.id,
                        traceId,
                        startTime: observation.startTime,
                      }
                    : undefined
                }
                spanName={observation.name ?? ""}
                webCallout={{
                  traceId,
                  observationId: observation.id,
                  sessionId: observation.sessionId ?? null,
                }}
              >
                {({ getTriggerProps }) => (
                  <Button
                    aria-label="Options"
                    className="shrink-0"
                    size="icon"
                    title="Options"
                    variant="secondary"
                    {...getTriggerProps()}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                )}
              </ConnectedDetailHeaderActionsMenuController>
            )}
          </div>
          {/* Action buttons (desktop inline cluster) */}
          {!isMobile && (
            <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
              {observationWithIO && (
                <ConnectedTraceObservationAddToDropdownMenuController
                  analyticsData={{ source: "TraceDetail", isV4: isV4Enabled }}
                  projectId={projectId}
                  key={observation.id}
                  traceId={traceId}
                  variant="observation"
                  observationId={observation.id}
                  input={observationWithIO.input}
                  output={observationWithIO.output}
                  metadata={observationWithIO.metadata}
                  generation={
                    isGenerationLike(observationWithIO.type)
                      ? observationWithIO
                      : undefined
                  }
                >
                  {({ getTriggerProps }) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      {...getTriggerProps()}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      <span>Add to</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  )}
                </ConnectedTraceObservationAddToDropdownMenuController>
              )}
              {/* Hide annotation buttons in annotation mode (panel shown separately) */}
              {!isAnnotationMode && (
                <AnnotateDrawerController projectId={projectId}>
                  {({ disabled, openDrawer }) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        openDrawer({
                          scoreTarget: {
                            type: "trace",
                            traceId,
                            observationId: observation.id,
                          },
                          scores: observationScores,
                          companionTrace: isV4Enabled
                            ? {
                                environment: trace.environment,
                                scores: traceScores,
                              }
                            : undefined,
                          analyticsData: {
                            type: "trace",
                            source: "TraceDetail",
                            isV4: isV4Enabled,
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
                    <span>Add comment</span>
                    {!!commentCount ? (
                      <ActionButtonCountBadge count={commentCount} />
                    ) : null}
                  </>
                )}
              </Button>
              <ConnectedDetailHeaderActionsMenuController
                idItems={[
                  { id: traceId, name: "Trace ID" },
                  { id: observation.id, name: "Observation ID" },
                ]}
                observationType={observation.type}
                projectId={projectId}
                observation={
                  isV4Enabled
                    ? {
                        id: observation.id,
                        traceId,
                        startTime: observation.startTime,
                      }
                    : undefined
                }
                spanName={observation.name ?? ""}
                webCallout={{
                  traceId,
                  observationId: observation.id,
                  sessionId: observation.sessionId ?? null,
                }}
              >
                {({ getTriggerProps }) => (
                  <Button
                    aria-label="Options"
                    className="shrink-0"
                    size="icon-sm"
                    title="Options"
                    variant="secondary"
                    {...getTriggerProps()}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                )}
              </ConnectedDetailHeaderActionsMenuController>
            </div>
          )}
        </div>

        {/* Metadata badges */}

        <div className="flex flex-col gap-2">
          {/* Timestamp */}
          {preparedDate ? (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span title={preparedDate.title}>{preparedDate.display}</span>
            </div>
          ) : null}

          {/* Other badges */}
          {!isAnnotationMode && (
            <CollapsibleBadgeRow>
              <LatencyBadge latencySeconds={latencySeconds} />
              <TimeToFirstTokenBadge
                timeToFirstToken={observation.timeToFirstToken}
              />
              {evaluatorId &&
                (observation.environment ===
                  LangfuseInternalTraceEnvironment.LLMJudge ||
                  observation.environment ===
                    LangfuseInternalTraceEnvironment.CodeEval) &&
                !evaluatorId.startsWith("managed:") && (
                  <EvaluatorBadge
                    evaluatorId={evaluatorId}
                    evaluatorName={evaluator.data?.name}
                    projectId={projectId}
                  />
                )}
              {displayedTotalCost != null && displayedCostDetails && (
                <CostBadge
                  totalCost={displayedTotalCost}
                  costDetails={displayedCostDetails}
                  costSource={costSource}
                  priceSource={priceSource}
                />
              )}
              {subtreeMetrics
                ? subtreeMetrics.hasGenerationLike &&
                  subtreeMetrics.usageDetails && (
                    <UsageBadge
                      inputUsage={subtreeMetrics.inputUsage}
                      outputUsage={subtreeMetrics.outputUsage}
                      totalUsage={subtreeMetrics.totalUsage}
                      usageDetails={subtreeMetrics.usageDetails}
                    />
                  )
                : isGenerationLike(observation.type) &&
                  observation.usageDetails && (
                    <UsageBadge
                      inputUsage={inputUsage}
                      outputUsage={outputUsage}
                      totalUsage={totalUsage}
                      usageDetails={observation.usageDetails}
                    />
                  )}
              {observation.model && (
                <ModelBadge
                  model={observation.model}
                  internalModelId={observation.internalModelId}
                  projectId={projectId}
                  usageDetails={observation.usageDetails}
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
        </div>
      </div>
    );
  },
);
