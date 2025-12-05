import { type Prisma } from "@langfuse/shared";
import { AdvancedJsonSection } from "@/src/components/ui/AdvancedJsonSection";
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
}: IOPreviewJSONProps) {
  const showInput = !hideInput && !(hideIfNull && !parsedInput && !input);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput && !output);

  return (
    <div className="flex flex-col gap-2">
      {showInput && (
        <AdvancedJsonSection
          title="Input"
          field="input"
          data={input}
          parsedData={parsedInput}
          isLoading={isLoading || isParsing}
          media={media?.filter((m) => m.field === "input")}
          enableSearch={true}
          searchPlaceholder="Search input"
          maxHeight="500px"
          hideIfNull={hideIfNull}
          truncateStringsAt={100}
          enableCopy={true}
        />
      )}
      {showOutput && (
        <AdvancedJsonSection
          title="Output"
          field="output"
          data={output}
          parsedData={parsedOutput}
          isLoading={isLoading || isParsing}
          media={media?.filter((m) => m.field === "output")}
          enableSearch={true}
          searchPlaceholder="Search output"
          maxHeight="500px"
          hideIfNull={hideIfNull}
          truncateStringsAt={100}
          enableCopy={true}
        />
      )}
    </div>
  );
}
