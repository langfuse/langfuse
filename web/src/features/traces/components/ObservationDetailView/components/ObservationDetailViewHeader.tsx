import { memo, useMemo } from "react";
import {
  type ObservationType,
  AnnotationQueueObjectType,
  isGenerationLike,
  type ScoreDomain,
} from "@langfuse/shared";
import type Decimal from "decimal.js";
import {
  ChevronDown,
  EllipsisVertical,
  ListPlus,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  SquarePen,
} from "lucide-react";

import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
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
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { cn } from "@/src/utils/tailwind";
import {
  type MetadataDomainClient,
  type WithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import {
  EnvironmentBadge,
  LatencyBadge,
  LevelBadge,
  ReleaseBadge,
  TimeToFirstTokenBadge,
  VersionBadge,
} from "../../ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge, UsageBadge } from "../../ObservationMetadataBadgesTooltip";
import { SessionBadge, UserIdBadge } from "../../TraceMetadataBadges";
import { ModelBadge } from "./ModelBadge";
import { ModelParametersBadges } from "./ModelParametersBadges";

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
    const traceScores = useMemo(
      () => serverScores.filter((score) => !score.observationId),
      [serverScores],
    );
    const hasAnnotationAccess = useHasProjectAccess({
      projectId,
      scope: "scores:CUD",
    });

    return (
      <div className="@container shrink-0 space-y-2 border-b p-2">
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
            {isMobile ? (
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
                  {observationWithIO ? (
                    <NewDatasetItemFromExistingObject
                      traceId={traceId}
                      observationId={observation.id}
                      projectId={projectId}
                      input={observationWithIO.input}
                      output={observationWithIO.output}
                      metadata={observationWithIO.metadata}
                      layout="menu"
                    />
                  ) : null}
                  {!isAnnotationMode ? (
                    <>
                      {isV4Enabled ? (
                        <Drawer
                          key={`annotation-drawer-menu-${observation.id}`}
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
                          key={`annotation-drawer-menu-${observation.id}`}
                          projectId={projectId}
                          scoreTarget={{
                            type: "trace",
                            traceId,
                            observationId: observation.id,
                          }}
                          scores={observationScores}
                          scoreMetadata={{
                            projectId,
                            environment: observation.environment,
                          }}
                          layout="menu"
                        />
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
                            <AnnotationQueueItemCountBadge
                              totalCount={totalCount}
                              layout="menu"
                            />
                          </Button>
                        )}
                      </AnnotationQueueItemDropdownMenuController>
                    </>
                  ) : null}
                  {observationWithIO &&
                    isGenerationLike(observationWithIO.type) && (
                      <JumpToPlaygroundButton
                        source="generation"
                        generation={observationWithIO}
                        analyticsEventName="trace_detail:test_in_playground_button_click"
                        layout="menu"
                      />
                    )}
                  <CommentDrawerController
                    projectId={projectId}
                    objectId={observation.id}
                    objectType="OBSERVATION"
                    count={commentCount}
                    pendingSelection={pendingSelection}
                    onSelectionUsed={onSelectionUsed}
                    isOpen={isCommentDrawerOpen}
                    onOpenChange={onCommentDrawerOpenChange}
                  >
                    {({ disabled, openDrawer }) => (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={openDrawer}
                        className="w-full justify-start gap-2 font-normal"
                      >
                        {disabled ? (
                          <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                        <span className="text-sm">Add comment</span>
                        {!disabled && commentCount ? (
                          <ActionButtonCountBadge count={commentCount} />
                        ) : null}
                      </Button>
                    )}
                  </CommentDrawerController>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          {!isMobile ? (
            <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
              {observationWithIO ? (
                <NewDatasetItemFromExistingObject
                  key={observation.id}
                  traceId={traceId}
                  observationId={observation.id}
                  projectId={projectId}
                  input={observationWithIO.input}
                  output={observationWithIO.output}
                  metadata={observationWithIO.metadata}
                  size="sm"
                />
              ) : null}
              {!isAnnotationMode ? (
                <div className="flex items-start">
                  {isV4Enabled ? (
                    <Drawer key={`annotation-drawer-${observation.id}`}>
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
                      key={`annotation-drawer-${observation.id}`}
                      projectId={projectId}
                      scoreTarget={{
                        type: "trace",
                        traceId,
                        observationId: observation.id,
                      }}
                      scores={observationScores}
                      scoreMetadata={{
                        projectId,
                        environment: observation.environment,
                      }}
                      size="sm"
                    />
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
                        className="rounded-l-none rounded-r-md border-l-2"
                      >
                        <span className="relative mr-1 text-xs">
                          <ChevronDown className="h-3 w-3" />
                          <AnnotationQueueItemCountBadge
                            totalCount={totalCount}
                            layout="toolbar"
                          />
                        </span>
                      </Button>
                    )}
                  </AnnotationQueueItemDropdownMenuController>
                </div>
              ) : null}
              {observationWithIO &&
                isGenerationLike(observationWithIO.type) && (
                  <JumpToPlaygroundButton
                    source="generation"
                    generation={observationWithIO}
                    analyticsEventName="trace_detail:test_in_playground_button_click"
                    size="sm"
                  />
                )}
              <CommentDrawerController
                projectId={projectId}
                objectId={observation.id}
                objectType="OBSERVATION"
                count={commentCount}
                pendingSelection={pendingSelection}
                onSelectionUsed={onSelectionUsed}
                isOpen={isCommentDrawerOpen}
                onOpenChange={onCommentDrawerOpenChange}
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={openDrawer}
                    className="gap-1"
                  >
                    {disabled ? (
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
                )}
              </CommentDrawerController>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <LocalIsoDate date={observation.startTime} accuracy="millisecond" />
          </div>
          {!isAnnotationMode ? (
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
              <ReleaseBadge release={observation.release} />
              <CostBadge
                totalCost={
                  subtreeMetrics
                    ? (treeNodeTotalCost?.toNumber() ??
                      subtreeMetrics.totalCost)
                    : observation.totalCost
                }
                costDetails={
                  subtreeMetrics?.costDetails ?? observation.costDetails
                }
                priceSource={
                  isGenerationLike(observation.type) &&
                  observation.internalModelId &&
                  observation.model &&
                  observation.usagePricingTierId &&
                  observation.usagePricingTierName &&
                  Object.keys(observation.providedCostDetails).length === 0 &&
                  (!subtreeMetrics ||
                    treeNodeTotalCost?.eq(observation.totalCost ?? 0) === true)
                    ? {
                        projectId,
                        modelId: observation.internalModelId,
                        modelName: observation.model,
                        pricingTierId: observation.usagePricingTierId,
                        pricingTierName: observation.usagePricingTierName,
                      }
                    : undefined
                }
              />
              {subtreeMetrics ? (
                subtreeMetrics.hasGenerationLike &&
                subtreeMetrics.usageDetails ? (
                  <UsageBadge
                    type="GENERATION"
                    inputUsage={subtreeMetrics.inputUsage}
                    outputUsage={subtreeMetrics.outputUsage}
                    totalUsage={subtreeMetrics.totalUsage}
                    usageDetails={subtreeMetrics.usageDetails}
                  />
                ) : null
              ) : (
                <UsageBadge
                  type={observation.type}
                  inputUsage={observation.inputUsage}
                  outputUsage={observation.outputUsage}
                  totalUsage={observation.totalUsage}
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
              {observation.promptId ? (
                <PromptBadge
                  promptId={observation.promptId}
                  projectId={projectId}
                />
              ) : null}
            </CollapsibleBadgeRow>
          ) : null}
        </div>
      </div>
    );
  },
);
