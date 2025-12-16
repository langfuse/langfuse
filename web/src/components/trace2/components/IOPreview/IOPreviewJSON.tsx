import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { type Prisma } from "@langfuse/shared";
import { AdvancedJsonSection } from "@/src/components/ui/AdvancedJsonSection/AdvancedJsonSection";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionStateProps } from "./IOPreview";
import {
  InlineCommentSelectionProvider,
  useInlineCommentSelectionOptional,
  type SelectionData,
} from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { CommentableJsonView } from "@/src/features/comments/components/CommentableJsonView";
import { InlineCommentBubble } from "@/src/features/comments/components/InlineCommentBubble";

export interface IOPreviewJSONProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  enableInlineComments?: boolean;
  onAddInlineComment?: (selection: SelectionData) => void;
  commentedPathsByField?: {
    input?: Map<string, Array<{ start: number; end: number }>>;
    output?: Map<string, Array<{ start: number; end: number }>>;
    metadata?: Map<string, Array<{ start: number; end: number }>>;
  };
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
// inner component that uses the selection context so that inline comments can be made
function IOPreviewJSONInner({
  input,
  output,
  metadata,
  parsedInput,
  parsedOutput,
  parsedMetadata,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  enableInlineComments = false,
  onAddInlineComment,
  commentedPathsByField,
}: IOPreviewJSONProps) {
  const selectionContext = useInlineCommentSelectionOptional();

  const handleAddComment = useCallback(() => {
    if (selectionContext?.selection && onAddInlineComment) {
      onAddInlineComment(selectionContext.selection);
    }
  }, [selectionContext?.selection, onAddInlineComment]);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Background colors that adapt to theme
  const inputBgColor = isDark ? "rgb(15, 23, 42)" : "rgb(249, 252, 255)"; // Dark slate vs light blue
  const outputBgColor = isDark ? "rgb(20, 30, 41)" : "rgb(248, 253, 250)"; // Dark blue-gray vs light green
  const metadataBgColor = isDark ? "rgb(30, 20, 40)" : "rgb(253, 251, 254)"; // Dark purple vs light purple

  // Height constants for accordion layout
  // AdvancedJsonSection header has minHeight: 38px
  const HEADER_HEIGHT = 38; // px
  const BODY_MAX_HEIGHT = `calc(100% - ${HEADER_HEIGHT}px)`;

  const showInput = !hideInput && !(hideIfNull && !parsedInput && !input);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput && !output);
  const showMetadata = !(hideIfNull && !parsedMetadata && !metadata);

  // Accordion state: only one section can be expanded at a time
  // Default to first visible section
  const defaultExpanded = showInput
    ? "input"
    : showOutput
      ? "output"
      : showMetadata
        ? "metadata"
        : null;
  const [expandedSection, setExpandedSection] = useState<
    "input" | "output" | "metadata" | null
  >(defaultExpanded);

  // Ensure expandedSection is always valid (if current is hidden, switch to first visible)
  useEffect(() => {
    if (expandedSection === "input" && !showInput) {
      setExpandedSection(
        showOutput ? "output" : showMetadata ? "metadata" : null,
      );
    } else if (expandedSection === "output" && !showOutput) {
      setExpandedSection(
        showInput ? "input" : showMetadata ? "metadata" : null,
      );
    } else if (expandedSection === "metadata" && !showMetadata) {
      setExpandedSection(showInput ? "input" : showOutput ? "output" : null);
    }
  }, [showInput, showOutput, showMetadata, expandedSection]);

  const wrapWithCommentable = (
    children: React.ReactNode,
    dataField: "input" | "output" | "metadata",
    className?: string,
  ) => {
    if (!enableInlineComments) {
      return <div className={className}>{children}</div>;
    }
    return (
      <CommentableJsonView
        dataField={dataField}
        enabled={enableInlineComments}
        className={className}
      >
        {children}
      </CommentableJsonView>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Inline comment bubble - shows when text is selected */}
      {enableInlineComments && (
        <InlineCommentBubble onAddComment={handleAddComment} />
      )}

      {showInput &&
        wrapWithCommentable(
          <AdvancedJsonSection
            title="Input"
            field="input"
            data={input}
            parsedData={parsedInput}
            collapsed={expandedSection !== "input"}
            onToggleCollapse={() =>
              setExpandedSection(expandedSection === "input" ? null : "input")
            }
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "input")}
            enableSearch={true}
            searchPlaceholder="Search input"
            maxHeight={BODY_MAX_HEIGHT}
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={inputBgColor}
            headerBackgroundColor={inputBgColor}
            className={expandedSection === "input" ? "min-h-0 flex-1" : ""}
            commentedPaths={commentedPathsByField?.input}
          />,
          "input",
          expandedSection === "input" ? "min-h-0 flex-1" : "",
        )}
      {showOutput &&
        wrapWithCommentable(
          <AdvancedJsonSection
            title="Output"
            field="output"
            data={output}
            parsedData={parsedOutput}
            collapsed={expandedSection !== "output"}
            onToggleCollapse={() =>
              setExpandedSection(expandedSection === "output" ? null : "output")
            }
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "output")}
            enableSearch={true}
            searchPlaceholder="Search output"
            maxHeight={BODY_MAX_HEIGHT}
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={outputBgColor}
            headerBackgroundColor={outputBgColor}
            className={expandedSection === "output" ? "min-h-0 flex-1" : ""}
            commentedPaths={commentedPathsByField?.output}
          />,
          "output",
          expandedSection === "output" ? "min-h-0 flex-1" : "",
        )}
      {showMetadata &&
        wrapWithCommentable(
          <AdvancedJsonSection
            title="Metadata"
            field="metadata"
            data={metadata}
            parsedData={parsedMetadata}
            collapsed={expandedSection !== "metadata"}
            onToggleCollapse={() =>
              setExpandedSection(
                expandedSection === "metadata" ? null : "metadata",
              )
            }
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "metadata")}
            enableSearch={true}
            searchPlaceholder="Search metadata"
            maxHeight={BODY_MAX_HEIGHT}
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={metadataBgColor}
            headerBackgroundColor={metadataBgColor}
            className={expandedSection === "metadata" ? "min-h-0 flex-1" : ""}
            commentedPaths={commentedPathsByField?.metadata}
          />,
          "metadata",
          expandedSection === "metadata" ? "min-h-0 flex-1" : "",
        )}
    </div>
  );
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
