import { memo } from "react";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import {
  type ObservationType,
  isGenerationLike,
  LangfuseInternalTraceEnvironment,
  type ScoreDomain,
} from "@langfuse/shared";
import type Decimal from "decimal.js";
import {
  EllipsisVertical,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  PlusIcon,
  SquarePen,
} from "@langfuse/icons";
import {
  ObservabilityEntityDetailHeader,
  type HeaderMetric,
} from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesProvider";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import {
  formatMetricCost,
  formatMetricTokens,
  hasBreakdown,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import {
  isGenerationMissingCost,
  isGenerationMissingUsage,
  resolveObservationCostSource,
} from "./costSource";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { resolveEvaluatorIdMetadata } from "@/src/features/traces/fns/resolveEvaluatorIdMetadata";
import { api } from "@/src/utils/api";
import {
  buildLocalIsoDatePresentation,
  formatIntervalSeconds,
} from "@/src/utils/dates";

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
  commentDrawerControl: { disabled: boolean; openDrawer: () => void };
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
    const { serverScores } = useTraceData();
    const { isAnnotationMode } = useViewPreferences();
    const { isV4: isV4Enabled } = useReadPath();
    const companionTrace = isV4Enabled
      ? {
          environment: observation.environment,
          scores: serverScores.filter(
            (score) => !score.observationId && score.traceId === traceId,
          ),
        }
      : undefined;
    const prompt = api.prompts.byId.useQuery(
      { id: observation.promptId ?? "", projectId },
      { enabled: Boolean(observation.promptId) },
    );
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
    const metrics: HeaderMetric[] = [];
    const preparedDate = buildLocalIsoDatePresentation({
      date: observation.startTime,
      accuracy: "millisecond",
    });
    if (preparedDate)
      metrics.push({
        id: "timestamp",
        type: "value",
        text: preparedDate.display,
        title: preparedDate.title,
        searchText: `timestamp ${preparedDate.display}`,
      });
    if (!isAnnotationMode) {
      if (latencySeconds != null)
        metrics.push({
          id: "latency",
          type: "value",
          text: formatIntervalSeconds(latencySeconds),
          searchText: `latency ${latencySeconds}`,
        });
      if (observation.timeToFirstToken != null)
        metrics.push({
          id: "ttft",
          type: "value",
          label: "ttft",
          text: formatIntervalSeconds(observation.timeToFirstToken),
          searchText: `ttft time to first token ${observation.timeToFirstToken}`,
        });
      if (
        evaluatorId &&
        isEvaluatorExecution &&
        !evaluatorId.startsWith("managed:")
      )
        metrics.push({
          id: "evaluator",
          type: "link",
          href: `/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`,
          newTab: true,
          label: "evaluator",
          text: evaluator.data?.name ?? evaluatorId,
          searchText: `evaluator ${evaluator.data?.name ?? ""} ${evaluatorId}`,
        });
      const displayedTotalCost = subtreeMetrics
        ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
        : observation.totalCost;
      const displayedCostDetails =
        subtreeMetrics?.costDetails ?? observation.costDetails;
      const showsNoCost = isGenerationMissingCost({
        type: observation.type,
        level: observation.level,
        totalCost: displayedTotalCost,
        costDetails: displayedCostDetails,
        providedUsageDetails: observation.providedUsageDetails,
        providedCostDetails: observation.providedCostDetails,
      });
      if (showsNoCost) {
        metrics.push({
          id: "cost",
          type: "missing-cost",
          projectId,
          hasUsage: Object.keys(observation.providedUsageDetails).length > 0,
          searchText: "no cost missing model price",
        });
      } else if (displayedTotalCost != null && displayedCostDetails) {
        const text = formatMetricCost(displayedTotalCost);
        const title = `exact $${displayedTotalCost.toFixed(6)}`;
        if (hasBreakdown(displayedCostDetails)) {
          const hasProvidedCostDetails =
            Object.keys(observation.providedCostDetails).length > 0;
          const priceSource =
            isGenerationLike(observation.type) &&
            observation.internalModelId &&
            observation.model &&
            observation.usagePricingTierId &&
            observation.usagePricingTierName &&
            !hasProvidedCostDetails &&
            !subtreeMetrics
              ? {
                  projectId,
                  modelId: observation.internalModelId,
                  modelName: observation.model,
                  pricingTierId: observation.usagePricingTierId,
                  pricingTierName: observation.usagePricingTierName,
                }
              : undefined;
          metrics.push({
            id: "cost",
            type: "cost",
            text,
            title,
            details: displayedCostDetails,
            costSource: resolveObservationCostSource({
              hasSubtreeMetrics: Boolean(subtreeMetrics),
              hasProvidedCostDetails,
            }),
            priceSource,
            searchText: `cost ${displayedTotalCost}`,
          });
        } else {
          metrics.push({
            id: "cost",
            type: "value",
            text,
            title,
            searchText: `cost ${displayedTotalCost}`,
          });
        }
      }
      const totalUsage = subtreeMetrics?.totalUsage ?? observation.totalUsage;
      const usageDetails = subtreeMetrics
        ? subtreeMetrics.usageDetails
        : observation.usageDetails;
      const hasGeneration = subtreeMetrics
        ? subtreeMetrics.hasGenerationLike
        : isGenerationLike(observation.type);
      const showsMissingUsage =
        !showsNoCost &&
        isGenerationMissingUsage({
          type: observation.type,
          level: observation.level,
          providedUsageDetails: observation.providedUsageDetails,
          providedCostDetails: observation.providedCostDetails,
        });
      if (showsMissingUsage)
        metrics.push({
          id: "usage-warning",
          type: "missing-usage",
          projectId,
          searchText: "usage not submitted",
        });
      if (
        hasGeneration &&
        totalUsage > 0 &&
        usageDetails &&
        hasBreakdown(usageDetails)
      )
        metrics.push({
          id: "usage",
          type: "tokens",
          text: formatMetricTokens(totalUsage),
          details: usageDetails,
          searchText: `tokens ${totalUsage}`,
        });
      if (observation.model && observation.internalModelId)
        metrics.push({
          id: "model",
          type: "link",
          href: `/project/${projectId}/settings/models/${observation.internalModelId}`,
          text: observation.model,
          searchText: `model ${observation.model}`,
        });
      if (observation.promptId && !prompt.isLoading && prompt.data)
        metrics.push({
          id: "prompt",
          type: "link",
          href: `/project/${projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`,
          label: "prompt",
          text: `${prompt.data.name} - v${prompt.data.version}`,
          searchText: `prompt ${prompt.data.name} ${prompt.data.version}`,
        });
    }

    const commentLabel =
      commentCount && !commentDrawerControl.disabled
        ? `Comments (${commentCount})`
        : "Comment";
    return (
      <UpsertModelFormDialogController
        action="create"
        projectId={projectId}
        prefilledModelData={{
          modelName: observation.model ?? undefined,
          prices:
            observation.usageDetails &&
            Object.keys(observation.usageDetails).length > 0
              ? Object.fromEntries(
                  Object.keys(observation.usageDetails)
                    .filter((key) => key !== "total")
                    .map((key) => [key, 0.000001]),
                )
              : undefined,
        }}
      >
        {({ openDialog: openModelDialog }) => (
          <ConnectedTraceObservationAddToDropdownMenuController
            key={observation.id}
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
                    renderMenu={(utilityItems) => {
                      const annotate = () =>
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
                        });
                      return (
                        <ObservabilityEntityDetailHeader
                          variant="page"
                          metrics={
                            !isAnnotationMode &&
                            observation.model &&
                            !observation.internalModelId
                              ? [
                                  ...metrics,
                                  {
                                    id: "model",
                                    type: "model",
                                    model: observation.model,
                                    onCreate: openModelDialog,
                                    searchText: `model ${observation.model}`,
                                  },
                                ]
                              : metrics
                          }
                          headerProps={{
                            title: observation.name || observation.id,
                            itemType: observation.type as ObservationType,
                            titleLevel: observation.level,
                            actions: [
                              {
                                id: "add-to",
                                type: "dropdown",
                                label: "Add to",
                                icon: PlusIcon,
                                disabled: !observationWithIO,
                                items: addToItems,
                              },
                              ...(!isAnnotationMode
                                ? [
                                    {
                                      id: "annotate",
                                      type: "button" as const,
                                      label: "Annotate",
                                      icon: annotationDisabled
                                        ? LockIcon
                                        : SquarePen,
                                      disabled: annotationDisabled,
                                      onClick: annotate,
                                    },
                                  ]
                                : []),
                              {
                                id: "comment",
                                type: "button",
                                label: commentLabel,
                                icon: commentDrawerControl.disabled
                                  ? MessageSquareOff
                                  : MessageSquare,
                                disabled: commentDrawerControl.disabled,
                                onClick: commentDrawerControl.openDrawer,
                              },
                              {
                                id: "options",
                                type: "dropdown",
                                label: "Options",
                                icon: EllipsisVertical,
                                iconOnly: true,
                                placement: "trailing",
                                items: utilityItems,
                              },
                            ],
                          }}
                        />
                      );
                    }}
                  />
                )}
              </AnnotateDrawerController>
            )}
          />
        )}
      </UpsertModelFormDialogController>
    );
  },
);
