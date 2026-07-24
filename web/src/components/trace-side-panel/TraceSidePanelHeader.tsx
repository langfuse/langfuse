/**
 * TraceSidePanelHeader - props-fed header for the consolidated observation
 * side panel (TraceSidePanel). Rendered by both the trace page/peek ("full"
 * variant) and the session inspector ("observation-only" variant).
 *
 * Contains:
 * - Title row with type chip, observation name + mono timestamp
 * - Action buttons (Playground, "+ Add to" menu, annotation-queue chevron,
 *   kebab menu, optional close button)
 * - Overview metrics grid (latency, environment, cost, usage, model, etc.)
 *
 * Purely props-fed: adapters map their data layer (trace contexts or session
 * events queries) into these props. No context reads besides none.
 */

import { memo, type ReactNode } from "react";
import {
  AnnotationQueueObjectType,
  isGenerationLike,
  type JsonNested,
  type Observation,
  type ObservationLevelType,
  type ObservationType,
} from "@langfuse/shared";
import { X } from "lucide-react";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import {
  OverviewGrid,
  TypeChip,
} from "@/src/components/trace/components/_shared/InspectorElements";
import { observationTypeIcon } from "@/src/components/session/sessionTypeIcons";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Button } from "@/src/components/ui/button";
import {
  AddToDropdownMenu,
  type AddToDropdownMenuProps,
} from "@/src/components/trace/components/_shared/AddToDropdownMenu";
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
} from "@/src/components/trace/components/ObservationDetailView/ObservationMetadataBadgesSimple";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/components/trace/components/TraceDetailView/TraceMetadataBadges";
import {
  CostBadge,
  UsageBadge,
} from "@/src/components/trace/components/ObservationDetailView/ObservationMetadataBadgesTooltip";
import { ModelBadge } from "@/src/components/trace/components/ObservationDetailView/ObservationMetadataBadgeModel";
import { ModelParametersBadges } from "@/src/components/trace/components/ObservationDetailView/ObservationMetadataBadgeModelParameters";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type AggregatedTraceMetrics } from "@/src/components/trace/lib/trace-aggregation";
import type Decimal from "decimal.js";
import { DetailHeaderActionsMenu } from "@/src/components/trace/components/_shared/DetailHeaderActionsMenu";
import { MobileHeaderOverflowPopover } from "@/src/components/trace/components/_shared/MobileHeaderOverflowPopover";
import { CollapsibleBadgeRow } from "@/src/components/trace/components/_shared/CollapsibleBadgeRow";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { Drawer, DrawerContent } from "@/src/components/ui/drawer";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { LockIcon, SquarePen } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

/**
 * Structural observation shape consumed by the header. Both
 * `ObservationReturnTypeWithMetadata` (trace context) and the session events
 * observation satisfy it.
 */
export interface TraceSidePanelObservation {
  id: string;
  type: ObservationType;
  name: string | null;
  startTime: Date;
  endTime?: Date | null;
  latency?: number | null;
  timeToFirstToken?: number | null;
  environment?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  level?: ObservationLevelType | null;
  statusMessage?: string | null;
  version?: string | null;
  model?: string | null;
  internalModelId?: string | null;
  modelParameters?: JsonNested | null;
  promptId?: string | null;
  totalCost: number | null;
  costDetails?: Record<string, number> | null;
  usageDetails?: Record<string, number> | null;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  traceTags?: string[] | null;
}

/** Generation payload for the playground button (pre-stringified I/O). */
export type PlaygroundGeneration = Omit<
  WithStringifiedMetadata<Observation>,
  "input" | "output"
> & {
  input: string | null;
  output: string | null;
};

export interface TraceSidePanelHeaderProps {
  variant: "full" | "observation-only";
  observation: TraceSidePanelObservation;
  projectId: string;
  traceId: string;
  latencySeconds: number | null;
  /** Enables the playground button when set (adapter gates on isGenerationLike). */
  playgroundGeneration: PlaygroundGeneration | null;
  /** Prefill for the "+ Add to" dataset form; undefined disables while loading. */
  datasetPrefill: AddToDropdownMenuProps["datasetPrefill"];
  /** Rendered inside the annotate drawer (adapter-built form). */
  annotateContent: ReactNode;
  /** Extra items appended to the "+ Add to" menu (session trace-level actions). */
  addToMenuExtraItems?: ReactNode;
  /**
   * Mobile counterpart of `addToMenuExtraItems`: extra rows appended to the
   * `⋯` overflow popover. Must be popover-compatible (labeled Buttons), not
   * DropdownMenuItems.
   */
  overflowMenuExtraItems?: ReactNode;
  hasExistingScores: boolean;
  commentCount: number | undefined;
  // Inline comment props
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  isCommentDrawerOpen?: boolean;
  onCommentDrawerOpenChange?: (open: boolean) => void;
  // Annotate drawer is view-owned so the Scores accordion can open it too
  isAnnotateDrawerOpen: boolean;
  onAnnotateDrawerOpenChange: (open: boolean) => void;
  /** Annotation-queue processor mode: hides actions + overview grid. */
  isAnnotationMode: boolean;
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
  /** observation-only: escape hatch to the trace view (kebab item). */
  onOpenTraceView?: () => void;
  /** observation-only: close button for the inspector panel. */
  onClose?: () => void;
}

export const TraceSidePanelHeader = memo(function TraceSidePanelHeader({
  variant,
  observation,
  projectId,
  traceId,
  latencySeconds,
  playgroundGeneration,
  datasetPrefill,
  annotateContent,
  addToMenuExtraItems,
  overflowMenuExtraItems,
  hasExistingScores,
  commentCount,
  pendingSelection,
  onSelectionUsed,
  isCommentDrawerOpen,
  onCommentDrawerOpenChange,
  isAnnotateDrawerOpen,
  onAnnotateDrawerOpenChange,
  isAnnotationMode,
  subtreeMetrics,
  treeNodeTotalCost,
  onOpenTraceView,
  onClose,
}: TraceSidePanelHeaderProps) {
  const isMobile = useIsMobile();
  const capture = usePostHogClientCapture();
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  // Format cost and usage values
  const totalCost = observation.totalCost;
  const totalUsage = observation.totalUsage;
  const inputUsage = observation.inputUsage;
  const outputUsage = observation.outputUsage;

  const openAnnotateDrawer = () => {
    onAnnotateDrawerOpenChange(true);
    capture(
      hasExistingScores ? "score:update_form_open" : "score:create_form_open",
      { type: "trace", source: "TraceDetail" },
    );
  };

  const overviewCells = (
    <>
      <LatencyBadge latencySeconds={latencySeconds} />
      <ModelBadge
        model={observation.model ?? null}
        internalModelId={observation.internalModelId ?? null}
        projectId={projectId}
        usageDetails={observation.usageDetails ?? undefined}
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
          usageDetails={observation.usageDetails ?? undefined}
        />
      )}
      <CostBadge
        totalCost={
          subtreeMetrics
            ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
            : totalCost
        }
        costDetails={
          subtreeMetrics?.costDetails ?? observation.costDetails ?? undefined
        }
      />
      <EnvironmentBadge environment={observation.environment} />
      <UserIdBadge userId={observation.userId ?? null} projectId={projectId} />
      <TimeToFirstTokenBadge timeToFirstToken={observation.timeToFirstToken} />
      <SessionBadge
        sessionId={observation.sessionId ?? null}
        projectId={projectId}
      />
      <ModelParametersBadges modelParameters={observation.modelParameters} />
      {observation.promptId && (
        <PromptBadge promptId={observation.promptId} projectId={projectId} />
      )}
      <VersionBadge version={observation.version} />
      <LevelBadge level={observation.level} />
      <StatusMessageBadge statusMessage={observation.statusMessage} />
    </>
  );

  return (
    <div
      className={
        variant === "observation-only"
          ? "@container shrink-0"
          : "@container shrink-0 space-y-3 p-3 pb-2.5"
      }
    >
      {/* Title row with actions — one line in the session inspector (mock);
          the trace page keeps the wrapping grid for narrow containers. */}
      <div
        className={
          variant === "observation-only"
            ? "border-border-contrast flex w-full items-center justify-between gap-2 border-b border-dashed px-4 py-1.5"
            : isMobile
              ? "flex w-full items-center gap-2"
              : "grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between"
        }
      >
        <div className="flex min-w-0 flex-1 flex-row items-center gap-2">
          {variant === "observation-only" ? (
            (() => {
              const { Icon, className } = observationTypeIcon(observation.type);
              return (
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${className}`}
                  strokeWidth={2}
                  aria-label={observation.type}
                />
              );
            })()
          ) : (
            <TypeChip type={observation.type} className="mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div
              className={
                variant === "observation-only"
                  ? "min-w-0 truncate text-sm font-bold"
                  : "line-clamp-2 min-w-0 text-sm font-bold break-all md:break-normal md:wrap-break-word"
              }
              title={observation.name || observation.id}
            >
              {observation.name || observation.id}
            </div>
            {/* The session inspector's eyebrow band already shows the
                timestamp; keep it here for the trace page only. */}
            {variant !== "observation-only" ? (
              <LocalIsoDate
                date={observation.startTime}
                accuracy="millisecond"
                className="text-muted-foreground font-mono text-[10px]"
              />
            ) : null}
          </div>
        </div>
        {/* Action buttons — grouped per the inspector design; on mobile the
            cluster collapses into a `⋯` overflow of labeled rows (LFE-11067) */}
        <div
          className={
            variant === "observation-only" || isMobile
              ? "flex shrink-0 items-center gap-1"
              : "flex h-full flex-wrap content-start items-center justify-start gap-1 @2xl:mr-1 @2xl:justify-end"
          }
        >
          {isMobile ? (
            <>
              <MobileHeaderOverflowPopover>
                {datasetPrefill ? (
                  <NewDatasetItemFromExistingObject
                    traceId={traceId}
                    observationId={observation.id}
                    projectId={projectId}
                    input={datasetPrefill.input}
                    output={datasetPrefill.output}
                    metadata={datasetPrefill.metadata}
                    layout="menu"
                  />
                ) : null}
                {!isAnnotationMode && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!hasAnnotationAccess}
                      className="w-full justify-start gap-2 font-normal"
                      onClick={openAnnotateDrawer}
                    >
                      {!hasAnnotationAccess ? (
                        <LockIcon className="h-3 w-3" />
                      ) : (
                        <SquarePen className="h-4 w-4" />
                      )}
                      <span className="text-sm">Annotate</span>
                    </Button>
                    <CreateNewAnnotationQueueItem
                      projectId={projectId}
                      objectId={observation.id}
                      objectType={AnnotationQueueObjectType.OBSERVATION}
                      layout="menu"
                    />
                  </>
                )}
                {playgroundGeneration &&
                  isGenerationLike(playgroundGeneration.type) && (
                    <JumpToPlaygroundButton
                      source="generation"
                      generation={playgroundGeneration}
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
                {overflowMenuExtraItems}
              </MobileHeaderOverflowPopover>
              {/* The annotate drawer is hosted by AddToDropdownMenu on
                  desktop; mount it here on mobile so the Scores accordion and
                  the overflow row can still open it. */}
              <Drawer
                open={isAnnotateDrawerOpen}
                onOpenChange={onAnnotateDrawerOpenChange}
              >
                <DrawerContent className="p-3">
                  {isAnnotateDrawerOpen ? annotateContent : null}
                </DrawerContent>
              </Drawer>
            </>
          ) : (
            <>
              {playgroundGeneration &&
                isGenerationLike(playgroundGeneration.type) && (
                  <JumpToPlaygroundButton
                    source="generation"
                    generation={playgroundGeneration}
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
                datasetPrefill={datasetPrefill}
                annotateContent={annotateContent}
                isAnnotateDrawerOpen={isAnnotateDrawerOpen}
                onAnnotateDrawerOpenChange={onAnnotateDrawerOpenChange}
                hasExistingScores={hasExistingScores}
                showAnnotate={!isAnnotationMode}
                onOpenComments={() => onCommentDrawerOpenChange?.(true)}
                commentCount={commentCount}
                extraMenuItems={addToMenuExtraItems}
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
            </>
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
            onOpenTraceView={
              variant === "observation-only" ? onOpenTraceView : undefined
            }
          />
          {onClose ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close inspector"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {/* Hidden host for the comment drawer: keeps deep-link auto-open
              (?comments=open) and inline-comment selection wiring intact;
              opened from the "Add comment" menu item via controlled state.
              On mobile the (force-mounted) overflow popover hosts it instead. */}
          {!isMobile && (
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
          )}
        </div>
      </div>

      {/* Overview metrics grid — mock row order first (latency, model,
          tokens, cost, env, user); the product's extra metrics follow.
          Mobile clips them to one expandable line (CollapsibleBadgeRow). */}
      {!isAnnotationMode && (
        <div
          className={cn(
            variant === "observation-only" &&
              (isMobile ? "px-4 py-2" : "px-4 py-4"),
          )}
        >
          {isMobile ? (
            <CollapsibleBadgeRow className="gap-x-4">
              {overviewCells}
            </CollapsibleBadgeRow>
          ) : (
            <OverviewGrid>{overviewCells}</OverviewGrid>
          )}
        </div>
      )}
    </div>
  );
});
