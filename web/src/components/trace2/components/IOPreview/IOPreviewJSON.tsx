import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { countJsonRows } from "@/src/components/ui/AdvancedJsonViewer/utils/rowCount";
import {
  MultiSectionJsonViewer,
  type MultiSectionJsonViewerHandle,
} from "@/src/components/ui/AdvancedJsonViewer/MultiSectionJsonViewer";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { ChevronUp, ChevronDown, WrapText, Minus, Copy } from "lucide-react";
import { useJsonViewPreferences } from "@/src/components/ui/AdvancedJsonViewer/hooks/useJsonViewPreferences";
import { type MediaReturnType } from "@/src/features/media/validation";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  InlineCommentSelectionProvider,
  useInlineCommentSelectionOptional,
  type SelectionData,
} from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { CommentableJsonView } from "@/src/features/comments/components/CommentableJsonView";
import { InlineCommentBubble } from "@/src/features/comments/components/InlineCommentBubble";
import { type CommentedPathsByField } from "@/src/components/ui/AdvancedJsonViewer/utils/commentRanges";
import { type ExpansionState } from "@/src/components/ui/AdvancedJsonViewer/types";
import { type ScoreDomain } from "@langfuse/shared";
import { CorrectedOutputField } from "./components/CorrectedOutputField";

const VIRTUALIZATION_THRESHOLD = 3333;

export interface IOPreviewJSONProps {
  outputCorrection?: ScoreDomain;
  // Pre-parsed data (from useParsedObservation hook)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  isParsing?: boolean;
  hideIfNull?: boolean;
  hideOutput?: boolean;
  hideInput?: boolean;
  // Media attachments
  media?: MediaReturnType[];
  // Callback to inform parent if virtualization is being used (for scroll handling)
  onVirtualizationChange?: (isVirtualized: boolean) => void;
  // Inline comment props
  enableInlineComments?: boolean;
  onAddInlineComment?: (selection: SelectionData) => void;
  commentedPathsByField?: CommentedPathsByField;
  // Correction props
  observationId?: string;
  projectId: string;
  traceId: string;
  environment?: string;
  // Combined expansion state (paths are prefixed: "input.foo", "output.bar", etc.)
  // Input accepts ExpansionState (boolean shorthand), callback receives Record (what viewer emits)
  expansionState?: ExpansionState;
  onExpansionChange?: (expansion: Record<string, boolean>) => void;
  showCorrections?: boolean;
}

/**
 * IOPreviewJSON - Renders input/output in JSON view mode only.
 *
 * Optimizations:
 * - No ChatML parsing (not needed for JSON view)
 * - No markdown rendering checks (not applicable)
 * - No tool definitions (only visible in pretty view)
 * - Accepts pre-parsed data to avoid duplicate parsing
 *
 * This component is ~150ms faster than the full IOPreview for large data
 * because it skips all ChatML processing.
 */
function IOPreviewJSONInner({
  parsedInput,
  parsedOutput,
  parsedMetadata,
  outputCorrection,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  onVirtualizationChange,
  enableInlineComments = false,
  onAddInlineComment,
  commentedPathsByField,
  observationId,
  projectId,
  traceId,
  environment = "default",
  expansionState,
  onExpansionChange,
  showCorrections = true,
}: IOPreviewJSONProps) {
  const selectionContext = useInlineCommentSelectionOptional();

  const handleAddComment = useCallback(() => {
    if (selectionContext?.selection && onAddInlineComment) {
      onAddInlineComment(selectionContext.selection);
    }
  }, [selectionContext?.selection, onAddInlineComment]);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Background colors that adapt to theme (memoized to prevent tree rebuilds)
  const { inputBgColor, outputBgColor, metadataBgColor } = useMemo(
    () => ({
      inputBgColor: isDark ? "rgb(15, 23, 42)" : "rgb(249, 252, 255)", // Dark slate vs light blue
      outputBgColor: isDark ? "rgb(20, 30, 41)" : "rgb(248, 253, 250)", // Dark blue-gray vs light green
      metadataBgColor: isDark ? "rgb(30, 20, 40)" : "rgb(253, 251, 254)", // Dark purple vs light purple
    }),
    [isDark],
  );

  const showInput = !hideInput && !(hideIfNull && parsedInput === undefined);
  const showOutput = !hideOutput && !(hideIfNull && parsedOutput === undefined);
  const showMetadata = !(hideIfNull && parsedMetadata === undefined);

  // Count rows for each section to determine if virtualization is needed
  const rowCounts = useMemo(() => {
    return {
      input: countJsonRows(parsedInput),
      output: countJsonRows(parsedOutput),
      metadata: countJsonRows(parsedMetadata),
    };
  }, [parsedInput, parsedOutput, parsedMetadata]);

  // Determine if virtualization is needed based on threshold
  const needsVirtualization = useMemo(() => {
    return (
      rowCounts.input > VIRTUALIZATION_THRESHOLD ||
      rowCounts.output > VIRTUALIZATION_THRESHOLD ||
      rowCounts.metadata > VIRTUALIZATION_THRESHOLD
    );
  }, [rowCounts]);

  // Hooks for multi-section viewer - must be called unconditionally
  const { stringWrapMode, setStringWrapMode } = useJsonViewPreferences();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MultiSectionJsonViewerHandle>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentMatchIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Notify parent about virtualization state
  useEffect(() => {
    onVirtualizationChange?.(needsVirtualization);
  }, [needsVirtualization, onVirtualizationChange]);

  // Search navigation callbacks
  const handleNextMatch = useCallback(() => {
    if (searchMatchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatchCount);
  }, [searchMatchCount]);

  const handlePreviousMatch = useCallback(() => {
    if (searchMatchCount === 0) return;
    setCurrentMatchIndex((prev) =>
      prev === 0 ? searchMatchCount - 1 : prev - 1,
    );
  }, [searchMatchCount]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Handle string wrap mode cycling
  const handleCycleWrapMode = useCallback(() => {
    if (stringWrapMode === "truncate") {
      setStringWrapMode("wrap");
    } else if (stringWrapMode === "wrap") {
      setStringWrapMode("nowrap");
    } else {
      setStringWrapMode("truncate");
    }
  }, [stringWrapMode, setStringWrapMode]);

  // Handle scrolling to a specific section
  const handleScrollToSection = useCallback((sectionKey: string) => {
    viewerRef.current?.scrollToSection(sectionKey);
  }, []);

  const handleCopy = useCallback(() => {
    const dataObj: Record<string, unknown> = {};
    if (showInput) dataObj.input = parsedInput;
    if (showOutput) dataObj.output = parsedOutput;
    if (showMetadata) dataObj.metadata = parsedMetadata;
    const jsonString = JSON.stringify(dataObj, null, 2);
    void navigator.clipboard.writeText(jsonString);
  }, [
    showInput,
    showOutput,
    showMetadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
  ]);

  const wrapIcon = useMemo(
    () =>
      stringWrapMode === "truncate" ? (
        <Minus size={14} />
      ) : stringWrapMode === "wrap" ? (
        <WrapText size={14} />
      ) : (
        <ChevronDown size={14} className="rotate-[-90deg]" />
      ),
    [stringWrapMode],
  );

  // Build sections - memoized to prevent re-creation
  const sections = useMemo(() => {
    const result = [];
    if (showInput) {
      result.push({
        key: "input",
        title: "Input",
        data: parsedInput,
        backgroundColor: inputBgColor,
        minHeight: "200px",
      });
    }
    if (showOutput) {
      result.push({
        key: "output",
        title: "Output",
        data: parsedOutput,
        backgroundColor: outputBgColor,
        minHeight: "200px",
      });
    }
    if (showCorrections) {
      result.push({
        key: "corrections",
        title: "Output correction",
        data: null,
        hideData: true, // Hide key/value display, only show header/footer
        backgroundColor: outputBgColor,
        minHeight: "4px",
        // Add corrected output as footer when corrections are enabled
        renderFooter: () => (
          <CorrectedOutputField
            actualOutput={parsedOutput}
            existingCorrection={outputCorrection}
            observationId={observationId}
            projectId={projectId}
            traceId={traceId}
            environment={environment}
            compact={true}
          />
        ),
      });
    }
    if (showMetadata) {
      result.push({
        key: "metadata",
        title: "Metadata",
        data: parsedMetadata,
        backgroundColor: metadataBgColor,
        minHeight: "200px",
      });
    }
    return result;
  }, [
    showInput,
    showOutput,
    showMetadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    inputBgColor,
    outputBgColor,
    metadataBgColor,
    showCorrections,
    observationId,
    outputCorrection,
    projectId,
    traceId,
    environment,
  ]);

  // Wait for parsing to complete before rendering to avoid flicker
  if (isParsing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col border-b border-t">
        <div className="flex h-full items-center justify-center">
          <div className="text-sm text-muted-foreground">Parsing data...</div>
        </div>
      </div>
    );
  }

  // The viewer content - wrapped in CommentableJsonView when comments are enabled
  const viewerContent = (
    <MultiSectionJsonViewer
      ref={viewerRef}
      sections={sections}
      virtualized={needsVirtualization}
      showLineNumbers={true}
      enableCopy={true}
      stringWrapMode={stringWrapMode}
      truncateStringsAt={stringWrapMode === "truncate" ? 100 : null}
      searchQuery={debouncedSearchQuery}
      currentMatchIndex={currentMatchIndex}
      onSearchResults={setSearchMatchCount}
      scrollContainerRef={scrollContainerRef as React.RefObject<HTMLDivElement>}
      media={media}
      commentedPathsByField={commentedPathsByField}
      externalExpansionState={expansionState}
      onExpansionChange={onExpansionChange}
      theme={{
        fontSize: "0.7rem",
        lineHeight: 14,
        indentSize: 12,
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-t">
      {/* Inline comment bubble - shows when text is selected */}
      {enableInlineComments && (
        <InlineCommentBubble onAddComment={handleAddComment} />
      )}

      {/* Header - matches LogViewToolbar styling */}
      <div className="flex h-9 flex-shrink-0 items-center gap-1.5 border-b bg-background px-2">
        {/* Search input - expands to fill available width */}
        <Command className="flex-1 rounded-none border-0 bg-transparent">
          <CommandInput
            showBorder={false}
            placeholder="Search across all sections..."
            className="h-7 border-0 focus:ring-0"
            value={searchQuery}
            onValueChange={setSearchQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  handlePreviousMatch();
                } else {
                  handleNextMatch();
                }
              } else if (e.key === "Escape") {
                handleClearSearch();
              }
            }}
          />
        </Command>

        {/* Match counter - inline text (only when searching) */}
        {searchQuery && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {searchMatchCount > 0
              ? `${currentMatchIndex + 1} of ${searchMatchCount}`
              : "No matches"}
          </span>
        )}

        {/* Navigation buttons (only when matches exist) */}
        {searchQuery && searchMatchCount > 0 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handlePreviousMatch}
              title="Previous match (Shift+Enter)"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleNextMatch}
              title="Next match (Enter)"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {/* Wrap mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCycleWrapMode}
          title={`String wrap mode: ${stringWrapMode}`}
        >
          {wrapIcon}
        </Button>

        {/* Copy button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Section navigation hint bar */}
      <div className="flex h-6 flex-shrink-0 items-center gap-1.5 border-b bg-background px-2">
        <span className="text-xs text-muted-foreground">Jump to:</span>
        {sections.map((section, index) => (
          <span key={section.key} className="flex items-center">
            <button
              onClick={() => handleScrollToSection(section.key)}
              className="cursor-pointer text-xs text-primary hover:underline"
            >
              {section.title}
            </button>
            {index < sections.length - 1 && (
              <span className="text-xs text-muted-foreground">,&nbsp;</span>
            )}
          </span>
        ))}
        {needsVirtualization && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="ml-auto cursor-help rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                Virtualized
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="bottom" align="end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Virtualized View</p>
                <p className="text-xs text-muted-foreground">
                  This view is using virtualization due to a large number of
                  keys ({rowCounts.input.toLocaleString()} input,{" "}
                  {rowCounts.output.toLocaleString()} output,{" "}
                  {rowCounts.metadata.toLocaleString()} metadata). Only visible
                  rows are rendered for optimal performance.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      {/* Body with MultiSectionJsonViewer */}
      <div className="min-h-0 flex-1 overflow-auto" ref={scrollContainerRef}>
        {enableInlineComments ? (
          <CommentableJsonView enabled={enableInlineComments}>
            {viewerContent}
          </CommentableJsonView>
        ) : (
          viewerContent
        )}
      </div>
    </div>
  );
}

/**
 * IOPreviewJSON - Wrapper that conditionally adds InlineCommentSelectionProvider.
 */
export function IOPreviewJSON(props: IOPreviewJSONProps) {
  // Wrap with selection provider if inline comments are enabled
  if (props.enableInlineComments) {
    return (
      <InlineCommentSelectionProvider>
        <IOPreviewJSONInner {...props} />
      </InlineCommentSelectionProvider>
    );
  }
  return <IOPreviewJSONInner {...props} />;
}
