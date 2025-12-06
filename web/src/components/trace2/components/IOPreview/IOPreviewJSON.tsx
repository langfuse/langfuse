import { useState, useMemo } from "react";
import { type Prisma } from "@langfuse/shared";
import { AdvancedJsonSection } from "@/src/components/ui/AdvancedJsonSection/AdvancedJsonSection";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionStateProps } from "./IOPreview";

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
export function IOPreviewJSON({
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
}: IOPreviewJSONProps) {
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

  return (
    <div className="flex h-full flex-col">
      {showInput && (
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
          backgroundColor="rgb(249, 252, 255)"
          headerBackgroundColor="rgb(249, 252, 255)"
          className={expandedSection === "input" ? "min-h-0 flex-1" : ""}
        />
      )}
      {showOutput && (
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
          backgroundColor="rgb(248, 253, 250)"
          headerBackgroundColor="rgb(248, 253, 250)"
          className={expandedSection === "output" ? "min-h-0 flex-1" : ""}
        />
      )}
      {showMetadata && (
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
          backgroundColor="rgb(253, 251, 254)"
          headerBackgroundColor="rgb(253, 251, 254)"
          className={expandedSection === "metadata" ? "min-h-0 flex-1" : ""}
        />
      )}
    </div>
  );
}
