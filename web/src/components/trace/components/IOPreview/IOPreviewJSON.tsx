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
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { decodeUnicodeInJson } from "@/src/utils/decodeUnicodeInJson";
import { CorrectedOutputField } from "./components/CorrectedOutputField";
import { LargeJsonFieldFallback } from "./components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_ROW_LIMIT,
  probeJsonField,
} from "./lib/jsonViewSizeGate";

const VIRTUALIZATION_THRESHOLD = 3333;

export interface IOPreviewJSONProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
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
  input,
  output,
  metadata,
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

  // Fall back to raw values when caller does not provide pre-parsed fields
  // (e.g. session events rows in v4 mode). Parse once here, BEFORE the decode
  // and tree-build, so the node-count gate below can act on the parsed shape.
  const inputParsed = useMemo(
    () => (isParsing ? undefined : (parsedInput ?? deepParseJson(input))),
    [parsedInput, input, isParsing],
  );
  const outputParsed = useMemo(
    () => (isParsing ? undefined : (parsedOutput ?? deepParseJson(output))),
    [parsedOutput, output, isParsing],
  );
  const metadataParsed = useMemo(
    () => (isParsing ? undefined : (parsedMetadata ?? deepParseJson(metadata))),
    [parsedMetadata, metadata, isParsing],
  );

  // Node-count gate (LFE-10847): the Beta viewer virtualizes the DOM but still
  // builds the full node tree on the main thread, so a field with too many
  // nodes (a large conversation / deeply nested JSON) freezes the tab even
  // here. Count rows once per field — cheap (~integer add per node) and, unlike
  // a char limit, correctly lets a huge single string (one node, e.g. a base64
  // data-URI) through while gating million-node payloads. `countJsonRows` also
  // feeds the virtualization decision below, so a gated field contributes 0.
  const inputRows = useMemo(() => countJsonRows(inputParsed), [inputParsed]);
  const outputRows = useMemo(() => countJsonRows(outputParsed), [outputParsed]);
  const metadataRows = useMemo(
    () => countJsonRows(metadataParsed),
    [metadataParsed],
  );

  const inputTooLarge = inputRows > JSON_VIEW_RENDER_ROW_LIMIT;
  const outputTooLarge = outputRows > JSON_VIEW_RENDER_ROW_LIMIT;
  const metadataTooLarge = metadataRows > JSON_VIEW_RENDER_ROW_LIMIT;

  // Decode \uXXXX escapes (e.g. Japanese ingested with Python
  // ensure_ascii=True) at the data source so that search-match offsets, comment
  // ranges, rendering and copy-to-clipboard all operate on the same decoded
  // strings. Decoding at the leaf renderer instead would desync highlight
  // offsets. Already-decoded strings are a no-op. Over-limit fields skip decode
  // and the tree entirely — they render the bounded fallback instead.
  const effectiveInput = useMemo(
    () =>
      isParsing || inputTooLarge ? undefined : decodeUnicodeInJson(inputParsed),
    [inputParsed, isParsing, inputTooLarge],
  );
  const effectiveOutput = useMemo(
    () =>
      isParsing || outputTooLarge
        ? undefined
        : decodeUnicodeInJson(outputParsed),
    [outputParsed, isParsing, outputTooLarge],
  );
  const effectiveMetadata = useMemo(
    () =>
      isParsing || metadataTooLarge
        ? undefined
        : decodeUnicodeInJson(metadataParsed),
    [metadataParsed, isParsing, metadataTooLarge],
  );

  // Probe over-limit fields once for the bounded fallback (preview + download).
  // Probe the PARSED value — the same value the row-count gate ran on — so the
  // preview, download and reported size all reflect what tripped the gate (a
  // string field that deep-parses into a large tree would otherwise show its
  // short raw length).
  const inputProbe = useMemo(
    () => (inputTooLarge ? probeJsonField(inputParsed) : null),
    [inputParsed, inputTooLarge],
  );
  const outputProbe = useMemo(
    () => (outputTooLarge ? probeJsonField(outputParsed) : null),
    [outputParsed, outputTooLarge],
  );
  const metadataProbe = useMemo(
    () => (metadataTooLarge ? probeJsonField(metadataParsed) : null),
    [metadataParsed, metadataTooLarge],
  );

  // A gated field parses to undefined above but is not empty — it is too big.
  // Treat it as present so hideIfNull callers still show the fallback instead
  // of silently dropping the field.
  const showInput =
    !hideInput &&
    (inputTooLarge || !(hideIfNull && effectiveInput === undefined));
  const showOutput =
    !hideOutput &&
    (outputTooLarge || !(hideIfNull && effectiveOutput === undefined));
  const showMetadata =
    metadataTooLarge || !(hideIfNull && effectiveMetadata === undefined);

  const downloadName = observationId ?? traceId;

  // Row counts drive the virtualization decision. Gated fields render as a
  // fallback (not inside the viewer), so they contribute 0.
  const rowCounts = useMemo(() => {
    return {
      input: inputTooLarge ? 0 : inputRows,
      output: outputTooLarge ? 0 : outputRows,
      metadata: metadataTooLarge ? 0 : metadataRows,
    };
  }, [
    inputTooLarge,
    outputTooLarge,
    metadataTooLarge,
    inputRows,
    outputRows,
    metadataRows,
  ]);

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
    // Gated fields have no materialized value (effective* is undefined), so
    // copy a placeholder rather than silently dropping the key — the field is
    // visibly present on screen (fallback + download), it just can't be inlined.
    const TOO_LARGE = "<omitted: too large to render — use the field download>";
    const dataObj: Record<string, unknown> = {};
    if (showInput) dataObj.input = inputTooLarge ? TOO_LARGE : effectiveInput;
    if (showOutput)
      dataObj.output = outputTooLarge ? TOO_LARGE : effectiveOutput;
    if (showMetadata)
      dataObj.metadata = metadataTooLarge ? TOO_LARGE : effectiveMetadata;
    const jsonString = JSON.stringify(dataObj, null, 2);
    navigator.clipboard.writeText(jsonString);
  }, [
    showInput,
    showOutput,
    showMetadata,
    inputTooLarge,
    outputTooLarge,
    metadataTooLarge,
    effectiveInput,
    effectiveOutput,
    effectiveMetadata,
  ]);

  const wrapIcon = useMemo(
    () =>
      stringWrapMode === "truncate" ? (
        <Minus size={14} />
      ) : stringWrapMode === "wrap" ? (
        <WrapText size={14} />
      ) : (
        <ChevronDown size={14} className="-rotate-90" />
      ),
    [stringWrapMode],
  );

  // Build sections - memoized to prevent re-creation. A gated field renders as
  // a section with no data (hideData → the viewer builds no tree for it, so it
  // can't freeze) whose footer is the bounded fallback. Keeping it a section —
  // rather than a block outside the viewer — preserves the natural
  // Input → Output → Metadata order and the shared search/scroll. The section
  // header shows the field name, so the fallback hides its own title.
  const sections = useMemo(() => {
    const gatedSection = (
      fieldKey: string,
      title: string,
      backgroundColor: string,
      probe: ReturnType<typeof probeJsonField> | null,
      rowCount: number,
    ) => ({
      // Use a key distinct from the field's normal section key so the fallback
      // does not inherit a persisted collapsed state from an earlier trace
      // where the same field rendered normally — that would silently hide the
      // download escape hatch (its collapse persists per section key). A gated
      // field gets its own key, so it always defaults to expanded.
      key: `${fieldKey}__oversized`,
      title,
      data: null,
      hideData: true,
      backgroundColor,
      minHeight: "4px",
      // A gated field has no tree to expand/collapse — only the download escape
      // hatch below. Render a header WITHOUT a collapse toggle, so the section
      // can never be collapsed: its collapse is therefore never persisted, and
      // the download can't be hidden — not silently (inherited state) and not
      // by a user collapsing one gated field then viewing another of the same
      // name (the gated→gated leak the plain key still allowed).
      renderHeader: () => (
        <div className="flex items-center px-2 py-1.5">
          <span className="text-xs font-bold">{title}</span>
        </div>
      ),
      renderFooter: () =>
        probe ? (
          <LargeJsonFieldFallback
            title={title}
            hideTitle
            serialized={probe.serialized}
            isString={probe.isString}
            charCount={probe.size}
            rowCount={rowCount}
            downloadFileBase={`${fieldKey}-${downloadName}`}
          />
        ) : null,
    });

    const result = [];
    if (showInput) {
      result.push(
        inputTooLarge
          ? gatedSection("input", "Input", inputBgColor, inputProbe, inputRows)
          : {
              key: "input",
              title: "Input",
              data: effectiveInput,
              backgroundColor: inputBgColor,
              minHeight: "200px",
            },
      );
    }
    if (showOutput) {
      result.push(
        outputTooLarge
          ? gatedSection(
              "output",
              "Output",
              outputBgColor,
              outputProbe,
              outputRows,
            )
          : {
              key: "output",
              title: "Output",
              data: effectiveOutput,
              backgroundColor: outputBgColor,
              minHeight: "200px",
            },
      );
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
            actualOutput={effectiveOutput}
            actualOutputTooLarge={outputTooLarge}
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
      result.push(
        metadataTooLarge
          ? gatedSection(
              "metadata",
              "Metadata",
              metadataBgColor,
              metadataProbe,
              metadataRows,
            )
          : {
              key: "metadata",
              title: "Metadata",
              data: effectiveMetadata,
              backgroundColor: metadataBgColor,
              minHeight: "200px",
            },
      );
    }
    return result;
  }, [
    showInput,
    showOutput,
    showMetadata,
    inputTooLarge,
    outputTooLarge,
    metadataTooLarge,
    effectiveInput,
    effectiveOutput,
    effectiveMetadata,
    inputProbe,
    outputProbe,
    metadataProbe,
    inputRows,
    outputRows,
    metadataRows,
    downloadName,
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
      <div className="flex min-h-0 flex-1 flex-col border-t border-b">
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground text-sm">Parsing data...</div>
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
    <div className="flex min-h-0 flex-1 flex-col border-t border-b">
      {/* Inline comment bubble - shows when text is selected */}
      {enableInlineComments && (
        <InlineCommentBubble onAddComment={handleAddComment} />
      )}

      {/* Header - matches LogViewToolbar styling */}
      <div className="bg-background flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
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
          <span className="text-muted-foreground text-xs whitespace-nowrap">
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
      <div className="bg-background flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
        <span className="text-muted-foreground text-xs">Jump to:</span>
        {sections.map((section, index) => (
          <span key={section.key} className="flex items-center">
            <button
              onClick={() => handleScrollToSection(section.key)}
              className="text-primary cursor-pointer text-xs hover:underline"
            >
              {section.title}
            </button>
            {index < sections.length - 1 && (
              <span className="text-muted-foreground text-xs">,&nbsp;</span>
            )}
          </span>
        ))}
        {needsVirtualization && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="bg-muted text-muted-foreground ml-auto cursor-help rounded px-1.5 py-px text-[10px] font-bold">
                Virtualized
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="bottom" align="end">
              <div className="space-y-2">
                <p className="text-sm font-bold">Virtualized View</p>
                <p className="text-muted-foreground text-xs">
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
