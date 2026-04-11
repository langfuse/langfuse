import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Textarea } from "../ui/textarea";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";

type SpielwieseAgentNodeToolsFieldProps = {
  node: SpielwieseAgentNodeVM;
  onToolsChange: (nodeId: string, value: string) => void;
};

export function getNodeToolsValue(notes: SpielwieseAgentNodeVM["notes"]) {
  const rawValue = notes.find((note) => note.id === "tools")?.value ?? "";

  return rawValue.trim().toLowerCase() === "no tools." ? "" : rawValue;
}

export function getNodeToolOptions(
  notes: SpielwieseAgentNodeVM["notes"],
): SpielwieseToolOption[] {
  const seenValues = new Set<string>();

  return getNodeToolsValue(notes)
    .split(/\r?\n|,/)
    .map((toolValue) => toolValue.trim())
    .filter(Boolean)
    .filter((toolValue) => {
      if (seenValues.has(toolValue)) {
        return false;
      }

      seenValues.add(toolValue);
      return true;
    })
    .map((toolValue) => ({
      label: toolValue,
      value: toolValue,
    }));
}

export function SpielwieseAgentNodeToolsField({
  node,
  onToolsChange,
}: SpielwieseAgentNodeToolsFieldProps) {
  const toolsValue = getNodeToolsValue(node.notes);
  const toolOptions = getNodeToolOptions(node.notes);

  return (
    <div className="bg-muted/35 flex min-w-0 flex-col gap-1.5 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
          Tools
        </span>
        <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
          {toolOptions.length === 0
            ? "None defined"
            : `${toolOptions.length} defined`}
        </span>
      </div>
      <Textarea
        aria-label={`${node.id} tools`}
        className="text-foreground placeholder:text-muted-foreground/70 [field-sizing:content] h-auto min-h-5 resize-none border-0 bg-transparent px-0 py-0 text-[0.8125rem] leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0 max-sm:text-base/6"
        name={`${node.id}-tools`}
        onChange={(event) => onToolsChange(node.id, event.target.value)}
        placeholder={"nutrition_lookup\ningredient_search"}
        rows={1}
        value={toolsValue}
      />
    </div>
  );
}
