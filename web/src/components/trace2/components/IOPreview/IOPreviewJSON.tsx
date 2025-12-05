import { type Prisma } from "@langfuse/shared";
import { CollapsibleJSONSection } from "@/src/components/ui/PrettyJSONView2/CollapsibleJSONSection";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionStateProps } from "./IOPreview";

export interface IOPreviewJSONProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
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
  parsedInput,
  parsedOutput,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
}: IOPreviewJSONProps) {
  const showInput = !hideInput && !(hideIfNull && !parsedInput && !input);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput && !output);

  // Handle expansion state (boolean indicates collapsed/expanded)
  const inputCollapsed =
    typeof inputExpansionState === "boolean" ? !inputExpansionState : false;
  const outputCollapsed =
    typeof outputExpansionState === "boolean" ? !outputExpansionState : false;

  const handleInputToggle = () => {
    if (onInputExpansionChange && typeof inputExpansionState === "boolean") {
      onInputExpansionChange(!inputExpansionState);
    }
  };

  const handleOutputToggle = () => {
    if (onOutputExpansionChange && typeof outputExpansionState === "boolean") {
      onOutputExpansionChange(!outputExpansionState);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {showInput && (
        <CollapsibleJSONSection
          title="Input"
          data={parsedInput ?? input}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "input") ?? []}
          enableSearch={true}
          searchPlaceholder="Search input"
          maxHeight="500px"
          collapsed={
            onInputExpansionChange !== undefined ? inputCollapsed : undefined
          }
          onToggleCollapse={
            onInputExpansionChange !== undefined ? handleInputToggle : undefined
          }
        />
      )}
      {showOutput && (
        <CollapsibleJSONSection
          title="Output"
          data={parsedOutput ?? output}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "output") ?? []}
          enableSearch={true}
          searchPlaceholder="Search output"
          maxHeight="500px"
          collapsed={
            onOutputExpansionChange !== undefined ? outputCollapsed : undefined
          }
          onToggleCollapse={
            onOutputExpansionChange !== undefined
              ? handleOutputToggle
              : undefined
          }
        />
      )}
    </div>
  );
}
