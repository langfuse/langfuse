import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
/**
 * ObservationDetailViewHeader - Extracted header component for ObservationDetailView
 *
 * Contains:
 * - Title row with EntityTitle, observation name, options menu
 * - Action buttons (Add to, Annotate, Comment)
 * - Metadata badges (timestamp, latency, environment, cost, usage, model, etc.)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useRef } from "react";
import {
  type ObservationType,
  isGenerationLike,
  LangfuseInternalTraceEnvironment,
  type ScoreDomain,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { EntityTitle } from "@/src/components/EntityTitle";
import { DetailViewHeaderShell } from "@/src/features/traces/components/DetailViewHeaderShell";
import { AnnotateDrawerController } from "@/src/features/scores";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { EvaluatorBadge } from "@/src/features/traces/components/ObservationDetailView/components/ObservationDetailViewHeader/components/EvaluatorBadge/EvaluatorBadge";
import {
  CostBadge,
  UsageBadge,
  hasBreakdown,
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
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import {
  EllipsisVertical,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  PlusIcon,
  SquarePen,
} from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
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
    const { trace, serverScores } = useTraceData();
    const { isAnnotationMode } = useViewPreferences();
    const isMobile = useIsMobile();
    const mobileActionsTriggerRef = useRef<HTMLButtonElement>(null);
    const commentActionLabel = commentCount ? "Comments" : "Comment";
    const mobileCommentActionLabel =
      commentCount && !commentDrawerControl.disabled
        ? `${commentActionLabel} (${commentCount})`
        : commentActionLabel;
    const { isV4: isV4Enabled } = useReadPath();
    const companionTrace = isV4Enabled
      ? {
          environment: trace.environment,
          scores: serverScores.filter((score) => !score.observationId),
        }
      : undefined;
    const prompt = api.prompts.byId.useQuery(
      { id: observation.promptId ?? "", projectId },
      { enabled: Boolean(observation.promptId) },
    );

    // Format cost and usage values
    const totalCost = observation.totalCost;
    const totalUsage = observation.totalUsage;
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

    const timestampBadge = preparedDate && (
      <span className="contents font-mono">
        <Badge
          color="ghost"
          text={preparedDate.display}
          title={preparedDate.title}
        />
      </span>
    );

    const renderAddToButton = (triggerProps: Record<string, unknown> = {}) => (
      <Button variant="secondary" size="sm" className="gap-1" {...triggerProps}>
        <PlusIcon className="icon-base" />
        <span>Add to</span>
        <DropdownIndicator size="sm" nudge />
      </Button>
    );

    return (
      <DetailViewHeaderShell>
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-center gap-2 @2xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex w-full min-w-0 flex-row items-center gap-2">
            <EntityTitle
              as="span"
              type={observation.type as ObservationType}
              title={observation.name || observation.id}
              level={observation.level}
            />
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
                renderMenu={(addToItems) => (
                  <AnnotateDrawerController projectId={projectId}>
                    {({ disabled: annotationDisabled, openDrawer }) => (
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
                        renderMenu={(utilityItems) => (
                          <DropdownMenu
                            placement="bottom-end"
                            maxHeight="min(24rem, calc(100dvh - 2rem))"
                            items={[
                              ...(!isAnnotationMode
                                ? [
                                    {
                                      type: "item" as const,
                                      id: "annotate",
                                      title: "Annotate",
                                      icon: annotationDisabled
                                        ? LockIcon
                                        : SquarePen,
                                      disabled: annotationDisabled
                                        ? {
                                            reason:
                                              "You don't have permission to annotate.",
                                          }
                                        : undefined,
                                      onClick: () => {
                                        mobileActionsTriggerRef.current?.focus({
                                          preventScroll: true,
                                        });
                                        openDrawer({
                                          ...prepareTraceAnnotation({
                                            traceId,
                                            projectId,
                                            environment:
                                              observation.environment,
                                            observationId: observation.id,
                                            scores: observationScores,
                                            isV4: isV4Enabled,
                                          }),
                                          companionTrace,
                                        });
                                      },
                                    },
                                  ]
                                : []),
                              {
                                type: "item",
                                id: "comments",
                                title: mobileCommentActionLabel,
                                icon: commentDrawerControl.disabled
                                  ? MessageSquareOff
                                  : MessageSquare,
                                disabled: commentDrawerControl.disabled
                                  ? {
                                      reason:
                                        "You don't have permission to comment.",
                                    }
                                  : undefined,
                                onClick: () => {
                                  mobileActionsTriggerRef.current?.focus({
                                    preventScroll: true,
                                  });
                                  commentDrawerControl.openDrawer();
                                },
                              },
                              ...(observationWithIO
                                ? [
                                    {
                                      type: "submenu" as const,
                                      id: "add-to",
                                      title: "Add to",
                                      icon: PlusIcon,
                                      items: addToItems,
                                    },
                                  ]
                                : []),
                              {
                                id: "review-actions-separator",
                                type: "separator",
                              },
                              ...utilityItems,
                            ]}
                          >
                            {({ getTriggerProps }) => (
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label="More actions"
                                className="ml-auto shrink-0"
                                {...getTriggerProps({
                                  ref: mobileActionsTriggerRef,
                                })}
                              >
                                <MoreHorizontal className="icon-base text-icon-foreground" />
                              </Button>
                            )}
                          </DropdownMenu>
                        )}
                      />
                    )}
                  </AnnotateDrawerController>
                )}
              />
            )}
          </div>
          {/* Action buttons (desktop inline cluster) */}
          {!isMobile && (
            <div className="flex flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
              {observationWithIO ? (
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
                  {({ getTriggerProps }) =>
                    renderAddToButton(getTriggerProps())
                  }
                </ConnectedTraceObservationAddToDropdownMenuController>
              ) : (
                renderAddToButton({ disabled: true })
              )}
              {/* Hide annotation buttons in annotation mode (panel shown separately) */}
              {!isAnnotationMode && (
                <AnnotateDrawerController projectId={projectId}>
                  {({ disabled, openDrawer }) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        openDrawer({
                          ...prepareTraceAnnotation({
                            traceId,
                            projectId,
                            environment: observation.environment,
                            observationId: observation.id,
                            scores: observationScores,
                            isV4: isV4Enabled,
                          }),
                          companionTrace,
                        })
                      }
                    >
                      {disabled ? (
                        <LockIcon className="icon-base mr-1.5" />
                      ) : (
                        <SquarePen className="icon-base mr-1.5" />
                      )}
                      <span>Annotate</span>
                    </Button>
                  )}
                </AnnotateDrawerController>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={commentDrawerControl.disabled}
                onClick={commentDrawerControl.openDrawer}
                className="gap-1"
              >
                {commentDrawerControl.disabled ? (
                  <MessageSquareOff className="icon-base text-muted-foreground" />
                ) : (
                  <>
                    <MessageSquare className="icon-base" />
                    <span>{commentActionLabel}</span>
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
                    variant="ghost"
                    {...getTriggerProps()}
                  >
                    <EllipsisVertical className="icon-base" />
                  </Button>
                )}
              </ConnectedDetailHeaderActionsMenuController>
            </div>
          )}
        </div>

        {/* Metadata line */}
        {isAnnotationMode ? (
          timestampBadge && (
            <div className="flex items-center">{timestampBadge}</div>
          )
        ) : (
          <CollapsibleBadgeRow>
            {timestampBadge}
            {latencySeconds != null && (
              <LatencyBadge latencySeconds={latencySeconds} />
            )}
            {observation.timeToFirstToken != null && (
              <TimeToFirstTokenBadge
                timeToFirstToken={observation.timeToFirstToken}
              />
            )}
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
                subtreeMetrics.totalUsage > 0 &&
                subtreeMetrics.usageDetails &&
                hasBreakdown(subtreeMetrics.usageDetails) && (
                  <UsageBadge
                    totalUsage={subtreeMetrics.totalUsage}
                    usageDetails={subtreeMetrics.usageDetails}
                  />
                )
              : isGenerationLike(observation.type) &&
                totalUsage > 0 &&
                observation.usageDetails &&
                hasBreakdown(observation.usageDetails) && (
                  <UsageBadge
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
            {observation.promptId && !prompt.isLoading && prompt.data && (
              <PromptBadge
                promptName={prompt.data.name}
                promptVersion={prompt.data.version}
                projectId={projectId}
              />
            )}
          </CollapsibleBadgeRow>
        )}
      </DetailViewHeaderShell>
    );
  },
);
