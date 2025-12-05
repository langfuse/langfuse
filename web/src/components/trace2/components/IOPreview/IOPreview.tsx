import { useEffect } from "react";
import { type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import usePreserveRelativeScroll from "@/src/hooks/usePreserveRelativeScroll";
import { type MediaReturnType } from "@/src/features/media/validation";

import { ViewModeToggle, type ViewMode } from "./components/ViewModeToggle";
import { IOPreviewJSON } from "./IOPreviewJSON";
import { IOPreviewPretty } from "./IOPreviewPretty";

export type { ViewMode };

export interface ExpansionStateProps {
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}

export interface IOPreviewProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
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
  onInputExpansionChange,
  onOutputExpansionChange,
  setIsPrettyViewAvailable,
}: IOPreviewProps) {
  const capture = usePostHogClientCapture();

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
    onInputExpansionChange,
    onOutputExpansionChange,
  };

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
       * - JSON view: IOPreviewJSON (no ChatML parsing, ~150ms faster)
       * - Pretty view: IOPreviewPretty (with ChatML parsing, markdown, tools)
       *
       * Only render the active view to prevent dual DOM tree construction.
       * Trade-off: scroll/expansion state is lost when toggling views,
       * but this eliminates UI freeze with large observations.
       */}
      {selectedView === "json" ? (
        <IOPreviewJSON {...sharedProps} />
      ) : (
        <IOPreviewPretty {...sharedProps} observationName={observationName} />
      )}
    </>
  );
}
