import { type ReactNode, useState } from "react";
import { type ObservationType, isGenerationLike } from "@langfuse/shared";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import {
  AnnotationQueueItemMenuContent,
  type AnnotationQueueItemMenuQueue,
} from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import {
  ChevronDown,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
} from "../../ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { ObservationLevelBadge } from "@/src/features/traces/components/ObservationLevelBadge";
import { SessionBadge, UserIdBadge } from "../../TraceMetadataBadges";
import { CostBadge, UsageBadge } from "../../ObservationMetadataBadgesTooltip";
import { ModelBadge } from "./ModelBadge";
import { ModelParametersBadges } from "./ModelParametersBadges";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { cn } from "@/src/utils/tailwind";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import type Decimal from "decimal.js";

export type ObservationDetailViewHeaderProps = {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
  latencySeconds: number | null;
  subtreeMetrics: AggregatedTraceMetrics | null | undefined;
  treeNodeTotalCost: Decimal | undefined;
  isAnnotationMode: boolean;
  isMobile: boolean;
  optionsMenu: ReactNode;
  datasetAction:
    | { type: "hidden" }
    | {
        type: "dialog";
        disabled: boolean;
        onClick: () => void;
      }
    | { type: "menu"; menu: ReactNode };
  annotationAction: {
    disabled: boolean;
    onClick: () => void;
  };
  annotationQueueAction: {
    disabled: boolean;
    totalCount: number;
    queues: AnnotationQueueItemMenuQueue[];
    onQueueItemToggle: (
      queueId: string,
      queueName: string,
      itemId?: string,
    ) => void;
  };
  playgroundMenu: ReactNode;
  commentAction: {
    disabled: boolean;
    count: number | undefined;
    onClick: () => void;
  };
};

export function ObservationDetailViewHeader({
  observation,
  projectId,
  latencySeconds,
  subtreeMetrics,
  treeNodeTotalCost,
  isAnnotationMode,
  isMobile,
  optionsMenu,
  datasetAction,
  annotationAction,
  annotationQueueAction,
  playgroundMenu,
  commentAction,
}: ObservationDetailViewHeaderProps) {
  const preparedDate = buildLocalIsoDatePresentation({
    date: observation.startTime,
    accuracy: "millisecond",
  });
  const [isAnnotationQueueMenuOpen, setIsAnnotationQueueMenuOpen] =
    useState(false);
  const annotationQueueMenu = (
    <DropdownMenu
      open={!annotationQueueAction.disabled && isAnnotationQueueMenuOpen}
      onOpenChange={(open) => {
        if (!annotationQueueAction.disabled) {
          setIsAnnotationQueueMenuOpen(open);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <ObservationHeaderQueueButton
          variant={isMobile ? "mobile" : "desktop"}
          disabled={annotationQueueAction.disabled}
          totalCount={annotationQueueAction.totalCount}
        />
      </DropdownMenuTrigger>
      <AnnotationQueueItemMenuContent
        projectId={projectId}
        queues={annotationQueueAction.queues}
        onQueueItemToggle={annotationQueueAction.onQueueItemToggle}
      />
    </DropdownMenu>
  );

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
          {optionsMenu}
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
                forceMount
                className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
              >
                {datasetAction.type === "dialog" ? (
                  <ObservationHeaderDatasetButton
                    variant="mobile"
                    disabled={datasetAction.disabled}
                    datasetCount={0}
                    onClick={datasetAction.onClick}
                  />
                ) : datasetAction.type === "menu" ? (
                  datasetAction.menu
                ) : null}
                {!isAnnotationMode ? (
                  <ObservationHeaderAnnotationButton
                    variant="mobile"
                    disabled={annotationAction.disabled}
                    onClick={annotationAction.onClick}
                  />
                ) : null}
                {!isAnnotationMode ? annotationQueueMenu : null}
                {playgroundMenu}
                <ObservationHeaderCommentButton
                  variant="mobile"
                  disabled={commentAction.disabled}
                  commentCount={commentAction.count}
                  onClick={commentAction.onClick}
                />
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
        {!isMobile ? (
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            {datasetAction.type === "dialog" ? (
              <ObservationHeaderDatasetButton
                variant="desktop"
                disabled={datasetAction.disabled}
                datasetCount={0}
                onClick={datasetAction.onClick}
              />
            ) : datasetAction.type === "menu" ? (
              datasetAction.menu
            ) : null}
            {!isAnnotationMode ? (
              <div className="flex items-start">
                <ObservationHeaderAnnotationButton
                  variant="desktop"
                  disabled={annotationAction.disabled}
                  onClick={annotationAction.onClick}
                />
                {annotationQueueMenu}
              </div>
            ) : null}
            {playgroundMenu}
            <ObservationHeaderCommentButton
              variant="desktop"
              disabled={commentAction.disabled}
              commentCount={commentAction.count}
              onClick={commentAction.onClick}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {preparedDate ? (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span title={preparedDate.title}>{preparedDate.display}</span>
          </div>
        ) : null}

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
                  ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
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
            {observation.level !== "DEFAULT" ? (
              <ObservationLevelBadge level={observation.level} size="default" />
            ) : null}
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
}

export function ObservationHeaderOptionsButton() {
  return (
    <Button
      aria-label="Options"
      className="mt-0.5 shrink-0"
      size="icon-xs"
      title="Options"
      variant="ghost"
    >
      <EllipsisVertical className="h-4 w-4" />
    </Button>
  );
}

export function ObservationHeaderDatasetButton({
  variant,
  disabled,
  datasetCount,
  onClick,
}: {
  variant: "mobile" | "desktop";
  disabled: boolean;
  datasetCount: number;
  onClick: () => void;
}) {
  const hasExistingDatasetItems = datasetCount > 0;
  const hasAccess = !disabled;
  if (variant === "mobile") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="w-full justify-start gap-2 font-normal"
        onClick={onClick}
      >
        {hasExistingDatasetItems || hasAccess ? (
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
        ) : null}
        <span className="text-sm">
          {hasExistingDatasetItems
            ? `In ${datasetCount} dataset(s)`
            : "Add to datasets"}
        </span>
        {hasExistingDatasetItems ? (
          <ChevronDown className="ml-auto h-3 w-3" />
        ) : !hasAccess ? (
          <LockIcon className="ml-auto h-3 w-3" aria-hidden="true" />
        ) : null}
      </Button>
    );
  }
  return (
    <Button variant="secondary" size="sm" disabled={disabled} onClick={onClick}>
      {!hasExistingDatasetItems && hasAccess ? (
        <PlusIcon className="mr-1.5 -ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
      ) : null}
      {hasExistingDatasetItems
        ? `In ${datasetCount} dataset(s)`
        : "Add to datasets"}
      {hasExistingDatasetItems ? (
        <ChevronDown className="ml-2 h-3 w-3" />
      ) : !hasAccess ? (
        <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
      ) : null}
    </Button>
  );
}

export function ObservationHeaderAnnotationButton({
  variant,
  disabled,
  onClick,
}: {
  variant: "mobile" | "desktop";
  disabled: boolean;
  onClick: () => void;
}) {
  if (variant === "mobile")
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="w-full justify-start gap-2 font-normal"
        onClick={onClick}
      >
        {disabled ? (
          <LockIcon className="h-3 w-3" />
        ) : (
          <SquarePen className="h-4 w-4" />
        )}
        <span className="text-sm">Annotate</span>
      </Button>
    );
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      className="rounded-r-none"
      onClick={onClick}
    >
      {disabled ? (
        <LockIcon className="mr-1.5 h-3 w-3" />
      ) : (
        <SquarePen className="mr-1.5 h-3.5 w-3.5" />
      )}
      <span>Annotate</span>
    </Button>
  );
}

export function ObservationHeaderQueueButton({
  variant,
  disabled,
  totalCount,
}: {
  variant: "mobile" | "desktop";
  disabled: boolean;
  totalCount: number;
}) {
  if (variant === "mobile")
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="w-full justify-start gap-2 font-normal"
      >
        <ListPlus className="h-4 w-4" />
        <span className="text-sm">Add to queue</span>
        <AnnotationQueueItemCountBadge totalCount={totalCount} layout="menu" />
      </Button>
    );
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
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
  );
}

export function ObservationHeaderPlaygroundButton({
  variant,
  disabled,
  title,
}: {
  variant: "mobile" | "desktop";
  disabled: boolean;
  title: string;
}) {
  if (variant === "mobile")
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={title}
        className={cn(
          "w-full justify-start gap-2 font-normal",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <Terminal className="h-4 w-4" />
        <span className="text-sm">Test in playground</span>
      </Button>
    );
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <Terminal className="h-3.5 w-3.5" />
      <span className="hidden md:inline">Playground</span>
      <ChevronDown className="h-3 w-3" />
    </Button>
  );
}

export function ObservationHeaderCommentButton({
  variant,
  disabled,
  commentCount,
  onClick,
}: {
  variant: "mobile" | "desktop";
  disabled: boolean;
  commentCount: number | undefined;
  onClick: () => void;
}) {
  if (variant === "mobile")
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onClick}
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
    );
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="gap-1"
    >
      {disabled ? (
        <MessageSquareOff className="text-muted-foreground h-3.5 w-3.5" />
      ) : (
        <>
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Add comment</span>
          {commentCount ? (
            <ActionButtonCountBadge count={commentCount} />
          ) : null}
        </>
      )}
    </Button>
  );
}
