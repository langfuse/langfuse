import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { type Prisma } from "@langfuse/shared";
import { AdvancedJsonSection } from "@/src/components/ui/AdvancedJsonSection/AdvancedJsonSection";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionStateProps } from "./IOPreview";
import { countJsonRows } from "@/src/components/ui/AdvancedJsonViewer/utils/rowCount";

const SECTION_PREFERENCE_KEY = "langfuse:io-section-preference";
const VIRTUALIZATION_THRESHOLD = 2500;
type SectionType = "input" | "output" | "metadata";

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
  // Callback to inform parent if virtualization is being used (for scroll handling)
  onVirtualizationChange?: (isVirtualized: boolean) => void;
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
  onVirtualizationChange,
}: IOPreviewJSONProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Background colors that adapt to theme
  const inputBgColor = isDark ? "rgb(15, 23, 42)" : "rgb(249, 252, 255)"; // Dark slate vs light blue
  const outputBgColor = isDark ? "rgb(20, 30, 41)" : "rgb(248, 253, 250)"; // Dark blue-gray vs light green
  const metadataBgColor = isDark ? "rgb(30, 20, 40)" : "rgb(253, 251, 254)"; // Dark purple vs light purple

  const showInput = !hideInput && !(hideIfNull && !parsedInput && !input);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput && !output);
  const showMetadata = !(hideIfNull && !parsedMetadata && !metadata);

  // Helper to check if data has content (renders rows in JSON viewer)
  // null/undefined = 0 rows, everything else (including {} and []) = 1+ rows
  const hasContent = (data: unknown): boolean => {
    if (data === null || data === undefined) return false;
    if (typeof data === "string") return data.trim().length > 0;
    // Arrays and objects always count as content (even if empty)
    // because they render as at least 1 row in the JSON viewer
    return true;
  };

  // Check for non-empty content (prefer parsed data if available)
  const outputHasContent = hasContent(parsedOutput ?? output);
  const inputHasContent = hasContent(parsedInput ?? input);
  const metadataHasContent = hasContent(parsedMetadata ?? metadata);

  // Count rows for each section to determine if virtualization is needed
  const rowCounts = useMemo(() => {
    return {
      input: countJsonRows(parsedInput ?? input),
      output: countJsonRows(parsedOutput ?? output),
      metadata: countJsonRows(parsedMetadata ?? metadata),
    };
  }, [parsedInput, input, parsedOutput, output, parsedMetadata, metadata]);

  // Determine if virtualization is needed based on threshold
  const needsVirtualization = useMemo(() => {
    return (
      rowCounts.input > VIRTUALIZATION_THRESHOLD ||
      rowCounts.output > VIRTUALIZATION_THRESHOLD ||
      rowCounts.metadata > VIRTUALIZATION_THRESHOLD
    );
  }, [rowCounts]);

  // Get user's preferred section from session storage
  const getUserPreference = (): SectionType | null => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(SECTION_PREFERENCE_KEY);
    if (stored === "input" || stored === "output" || stored === "metadata") {
      return stored;
    }
    return null;
  };

  // Check if user's preferred section is visible and has content
  const userPreference = getUserPreference();
  const userPreferenceIsVisible =
    userPreference === "output"
      ? showOutput
      : userPreference === "input"
        ? showInput
        : userPreference === "metadata"
          ? showMetadata
          : false;
  const userPreferenceHasContent =
    userPreference === "output"
      ? showOutput && outputHasContent
      : userPreference === "input"
        ? showInput && inputHasContent
        : userPreference === "metadata"
          ? showMetadata && metadataHasContent
          : false;

  // Accordion state: only one section can be expanded at a time
  // Default expansion priority:
  // 1. User preference (if visible AND has content)
  // 2. Output > Input > Metadata (first with content)
  // 3. User preference (if visible, even without content)
  // 4. Output > Input > Metadata (first visible)
  const defaultExpanded = userPreferenceHasContent
    ? userPreference
    : showOutput && outputHasContent
      ? "output"
      : showInput && inputHasContent
        ? "input"
        : showMetadata && metadataHasContent
          ? "metadata"
          : userPreferenceIsVisible
            ? userPreference
            : showOutput
              ? "output"
              : showInput
                ? "input"
                : showMetadata
                  ? "metadata"
                  : null;
  const [expandedSection, setExpandedSection] = useState<
    "input" | "output" | "metadata" | null
  >(defaultExpanded);

  // Handle user manually selecting a section (stores preference)
  const handleUserToggle = useCallback(
    (section: SectionType) => {
      const isExpanding = expandedSection !== section;
      setExpandedSection(isExpanding ? section : null);

      // Only store preference when user manually expands a section
      if (isExpanding && typeof window !== "undefined") {
        sessionStorage.setItem(SECTION_PREFERENCE_KEY, section);
      }
    },
    [expandedSection],
  );

  // Ensure expandedSection is always valid (if current is hidden, switch to first visible)
  // Priority: output > input > metadata
  useEffect(() => {
    if (expandedSection === "output" && !showOutput) {
      setExpandedSection(
        showInput ? "input" : showMetadata ? "metadata" : null,
      );
    } else if (expandedSection === "input" && !showInput) {
      setExpandedSection(
        showOutput ? "output" : showMetadata ? "metadata" : null,
      );
    } else if (expandedSection === "metadata" && !showMetadata) {
      setExpandedSection(showOutput ? "output" : showInput ? "input" : null);
    }
  }, [showInput, showOutput, showMetadata, expandedSection]);

  // Notify parent about virtualization state
  useEffect(() => {
    onVirtualizationChange?.(needsVirtualization);
  }, [needsVirtualization, onVirtualizationChange]);

  // Path A: Large data (virtualized, accordion mode - one section at a time)
  if (needsVirtualization) {
    const maxRows = Math.max(
      rowCounts.input,
      rowCounts.output,
      rowCounts.metadata,
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Visual indicator for virtualized mode */}
        <div className="border-b bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          ⚡ Large data detected ({maxRows.toLocaleString()} rows). Showing
          sections separately for performance.
        </div>

        {showInput && (
          <AdvancedJsonSection
            title="Input"
            field="input"
            data={input}
            parsedData={parsedInput}
            collapsed={expandedSection !== "input"}
            onToggleCollapse={() => handleUserToggle("input")}
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "input")}
            enableSearch={true}
            searchPlaceholder="Search input"
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={inputBgColor}
            headerBackgroundColor={inputBgColor}
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
            onToggleCollapse={() => handleUserToggle("output")}
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "output")}
            enableSearch={true}
            searchPlaceholder="Search output"
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={outputBgColor}
            headerBackgroundColor={outputBgColor}
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
            onToggleCollapse={() => handleUserToggle("metadata")}
            isLoading={isLoading || isParsing}
            media={media?.filter((m) => m.field === "metadata")}
            enableSearch={true}
            searchPlaceholder="Search metadata"
            hideIfNull={hideIfNull}
            truncateStringsAt={100}
            enableCopy={true}
            backgroundColor={metadataBgColor}
            headerBackgroundColor={metadataBgColor}
            className={expandedSection === "metadata" ? "min-h-0 flex-1" : ""}
          />
        )}
      </div>
    );
  }

  // Path B: Normal data (non-virtualized, continuous scroll - all sections visible)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showInput && (
        <AdvancedJsonSection
          title="Input"
          field="input"
          data={input}
          parsedData={parsedInput}
          collapsed={false} // Always expanded in continuous scroll mode
          isLoading={isLoading || isParsing}
          media={media?.filter((m) => m.field === "input")}
          enableSearch={true}
          searchPlaceholder="Search input"
          hideIfNull={hideIfNull}
          truncateStringsAt={100}
          enableCopy={true}
          virtualized={false} // Force non-virtualized rendering
          backgroundColor={inputBgColor}
          headerBackgroundColor={inputBgColor}
        />
      )}
      {showOutput && (
        <AdvancedJsonSection
          title="Output"
          field="output"
          data={output}
          parsedData={parsedOutput}
          collapsed={false} // Always expanded in continuous scroll mode
          isLoading={isLoading || isParsing}
          media={media?.filter((m) => m.field === "output")}
          enableSearch={true}
          searchPlaceholder="Search output"
          hideIfNull={hideIfNull}
          truncateStringsAt={100}
          enableCopy={true}
          virtualized={false} // Force non-virtualized rendering
          backgroundColor={outputBgColor}
          headerBackgroundColor={outputBgColor}
        />
      )}
      {showMetadata && (
        <AdvancedJsonSection
          title="Metadata"
          field="metadata"
          data={metadata}
          parsedData={parsedMetadata}
          collapsed={false} // Always expanded in continuous scroll mode
          isLoading={isLoading || isParsing}
          media={media?.filter((m) => m.field === "metadata")}
          enableSearch={true}
          searchPlaceholder="Search metadata"
          hideIfNull={hideIfNull}
          truncateStringsAt={100}
          enableCopy={true}
          virtualized={false} // Force non-virtualized rendering
          backgroundColor={metadataBgColor}
          headerBackgroundColor={metadataBgColor}
        />
      )}
    </div>
  );
}
