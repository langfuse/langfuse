import { useEffect } from "react";
import { type ScoreDomain, type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import usePreserveRelativeScroll from "@/src/hooks/usePreserveRelativeScroll";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionState } from "@/src/components/ui/AdvancedJsonViewer/types";

import { ViewModeToggle, type ViewMode } from "./components/ViewModeToggle";
import { IOPreviewJSON, type IOPreviewJSONProps } from "./IOPreviewJSON";
import { IOPreviewJSONSimple } from "./IOPreviewJSONSimple";
import { IOPreviewPretty } from "./IOPreviewPretty";
import { Button } from "@/src/components/ui/button";
import { ActionButton } from "@/src/components/ActionButton";
import { BookOpen, X } from "lucide-react";

export type { ViewMode };

const EMPTY_IO_ALERT_ID = "empty-io";
const STORAGE_KEY = "dismissed-trace-view-notifications";

export interface ExpansionStateProps {
  // Per-field expansion state (for formatted and json views)
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  metadataExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onMetadataExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  // Combined expansion state (for advanced-json view only)
  // Paths are prefixed: "input.foo", "output.bar", "metadata.baz"
  // Input accepts ExpansionState (boolean shorthand allowed), callback receives Record (what viewer emits)
  advancedJsonExpansionState?: ExpansionState;
  onAdvancedJsonExpansionChange?: (expansion: Record<string, boolean>) => void;
  // Simple boolean expansion state (for legacy json view only)
  // true = expanded, false = collapsed
  jsonInputExpanded?: boolean;
  jsonOutputExpanded?: boolean;
  jsonMetadataExpanded?: boolean;
  onJsonInputExpandedChange?: (expanded: boolean) => void;
  onJsonOutputExpandedChange?: (expanded: boolean) => void;
  onJsonMetadataExpandedChange?: (expanded: boolean) => void;
}

export interface IOPreviewProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  outputCorrection?: ScoreDomain;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  observationName?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  currentView?: ViewMode;
  setIsPrettyViewAvailable?: (value: boolean) => void;
  // Inline comment props (JSON Beta view only)
  enableInlineComments?: boolean;
  onAddInlineComment?: IOPreviewJSONProps["onAddInlineComment"];
  commentedPathsByField?: IOPreviewJSONProps["commentedPathsByField"];
  // Whether to show metadata section in pretty view (default: false)
  // JSON view always shows metadata
  showMetadata?: boolean;
  // Callback to inform parent if virtualization is being used (for scroll handling)
  onVirtualizationChange?: (isVirtualized: boolean) => void;
  // For CorrectedOutputField
  observationId?: string;
  projectId: string;
  traceId: string;
  environment?: string;
  showCorrections?: boolean;
}

/**
 * IOPreview - Router component for rendering observation input/output.
 *
 * Architecture:
 * - This component handles view state management and routing only
 * - Routes to IOPreviewJSON for JSON view (no ChatML parsing)
 * - Routes to IOPreviewPretty for pretty view (with ChatML parsing)
 *
 * Performance benefits:
 * - JSON view: skips ~150ms of ChatML parsing overhead
 * - Pretty view: only parses when needed for display
 * - Pre-parsed data from Web Worker eliminates duplicate parsing
 */
export function IOPreview({
  input,
  output,
  outputCorrection,
  metadata,
  parsedInput,
  parsedOutput,
  parsedMetadata,
  observationName,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  currentView,
  inputExpansionState,
  outputExpansionState,
  metadataExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  onMetadataExpansionChange,
  advancedJsonExpansionState,
  onAdvancedJsonExpansionChange,
  jsonInputExpanded,
  jsonOutputExpanded,
  jsonMetadataExpanded,
  onJsonInputExpandedChange,
  onJsonOutputExpandedChange,
  onJsonMetadataExpandedChange,
  setIsPrettyViewAvailable,
  enableInlineComments,
  onAddInlineComment,
  commentedPathsByField,
  showMetadata = false,
  onVirtualizationChange,
  observationId,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
}: IOPreviewProps) {
  const capture = usePostHogClientCapture();
  const [dismissedTraceViewNotifications, setDismissedTraceViewNotifications] =
    useLocalStorage<string[]>(STORAGE_KEY, []);

  // View state management
  const [localCurrentView, setLocalCurrentView] = useLocalStorage<ViewMode>(
    "jsonViewPreference",
    "pretty",
  );
  const selectedView = currentView ?? localCurrentView;
  const showViewToggle = currentView === undefined;

  const [compensateScrollRef, startPreserveScroll] =
    usePreserveRelativeScroll<HTMLDivElement>([selectedView]);

  // Notify parent about pretty view availability
  // Always true - we always show the toggle and let components decide rendering
  useEffect(() => {
    setIsPrettyViewAvailable?.(true);
  }, [setIsPrettyViewAvailable]);

  // Handle view change with analytics
  const handleViewChange = (view: ViewMode) => {
    startPreserveScroll();
    capture("trace_detail:io_mode_switch", { view });
    setLocalCurrentView(view);
  };

  // Shared props for both view components
  const sharedProps = {
    input,
    output,
    outputCorrection,
    metadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    isLoading,
    isParsing,
    hideIfNull,
    hideInput,
    hideOutput,
    media,
    inputExpansionState,
    outputExpansionState,
    metadataExpansionState,
    onInputExpansionChange,
    onOutputExpansionChange,
    onMetadataExpansionChange,
    observationId,
    projectId,
    traceId,
    environment,
    showCorrections,
  };

  // Only show empty state popup for traces (not observations) when there's no input/output
  // Check both parsed and raw props since not all callers provide parsedInput/parsedOutput
  const hasInput = input !== null && input !== undefined;
  const hasOutput = output !== null && output !== undefined;
  const showEmptyState =
    !hasInput &&
    !hasOutput &&
    !observationName && // Only show for traces, not observations
    !isLoading &&
    !hideIfNull &&
    !dismissedTraceViewNotifications.includes(EMPTY_IO_ALERT_ID);

  return (
    <>
      {showViewToggle && (
        <ViewModeToggle
          selectedView={selectedView}
          onViewChange={handleViewChange}
          compensateScrollRef={compensateScrollRef}
        />
      )}

      {/*
       * Conditional rendering based on view mode:
       * - JSON Beta view: IOPreviewJSON (advanced viewer with virtualization, search, inline comments)
       * - JSON view: IOPreviewJSONSimple (simple react18-json-view, no virtualization, no comments)
       * - Pretty view: IOPreviewPretty (with ChatML parsing, markdown, tools)
       *
       * Only render the active view to prevent dual DOM tree construction.
       * Trade-off: scroll/expansion state is lost when toggling views,
       * but this eliminates UI freeze with large observations.
       */}
      {selectedView === "json-beta" ? (
        <IOPreviewJSON
          parsedInput={parsedInput}
          parsedOutput={parsedOutput}
          parsedMetadata={parsedMetadata}
          outputCorrection={outputCorrection}
          isParsing={isParsing}
          hideIfNull={hideIfNull}
          hideInput={hideInput}
          hideOutput={hideOutput}
          media={media}
          expansionState={advancedJsonExpansionState}
          onExpansionChange={onAdvancedJsonExpansionChange}
          onVirtualizationChange={onVirtualizationChange}
          enableInlineComments={enableInlineComments}
          onAddInlineComment={onAddInlineComment}
          commentedPathsByField={commentedPathsByField}
          observationId={observationId}
          projectId={projectId}
          traceId={traceId}
          environment={environment}
          showCorrections={showCorrections}
        />
      ) : selectedView === "json" ? (
        <IOPreviewJSONSimple
          input={input}
          output={output}
          metadata={metadata}
          outputCorrection={outputCorrection}
          parsedInput={parsedInput}
          parsedOutput={parsedOutput}
          parsedMetadata={parsedMetadata}
          isLoading={isLoading}
          isParsing={isParsing}
          hideIfNull={hideIfNull}
          hideInput={hideInput}
          hideOutput={hideOutput}
          media={media}
          inputExpanded={jsonInputExpanded}
          outputExpanded={jsonOutputExpanded}
          metadataExpanded={jsonMetadataExpanded}
          onInputExpandedChange={onJsonInputExpandedChange}
          onOutputExpandedChange={onJsonOutputExpandedChange}
          onMetadataExpandedChange={onJsonMetadataExpandedChange}
          observationId={observationId}
          projectId={projectId}
          traceId={traceId}
          environment={environment}
        />
      ) : (
        <IOPreviewPretty
          {...sharedProps}
          observationName={observationName}
          showMetadata={showMetadata}
        />
      )}

      {showEmptyState && (
        <div className="py-2">
          <div className="relative mx-2 flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1.5 top-1.5 h-5 w-5 p-0"
              onClick={() => {
                capture("notification:dismiss_notification", {
                  notification_id: EMPTY_IO_ALERT_ID,
                });
                setDismissedTraceViewNotifications((prev) =>
                  prev.includes(EMPTY_IO_ALERT_ID)
                    ? prev
                    : [...prev, EMPTY_IO_ALERT_ID],
                );
              }}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <div className="flex w-full flex-row items-center gap-2 pr-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold">
                Looks like this trace didn&apos;t receive an input or output.
              </h3>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add it in your code to make debugging a lot easier.
            </p>
            <ActionButton
              variant="outline"
              size="sm"
              href="https://langfuse.com/faq/all/empty-trace-input-and-output"
              trackingEventName="notification:click_link"
              trackingProps={{ notification_id: EMPTY_IO_ALERT_ID }}
            >
              View Documentation
            </ActionButton>
          </div>
        </div>
      )}
    </>
  );
}
