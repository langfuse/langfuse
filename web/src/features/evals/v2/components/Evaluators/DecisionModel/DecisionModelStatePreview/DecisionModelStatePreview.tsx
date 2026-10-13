import { useMemo, useState } from "react";
import { deepParseJsonIterative } from "@langfuse/shared";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { extractVariableMappingValue } from "@/src/features/evals/v2/fns/variableMapping/extractVariableMappingValue";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";
import { cn } from "@/src/utils/tailwind";

type PreviewField = {
  key: string;
  fieldState: VariableFieldState;
};

/** TypeSafe accepts ~32k for state plus the longest question; warn well below. */
const STATE_SIZE_WARNING_CHARS = 24_000;

function buildStatePreview(
  fields: PreviewField[],
  sourceObject: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!sourceObject) return null;
  const state: Record<string, unknown> = {};
  for (const field of fields) {
    const columnId = field.fieldState.selectedColumnId;
    if (!columnId) continue;
    const { value } = extractVariableMappingValue(
      sourceObject,
      columnId,
      field.fieldState.jsonSelector ?? undefined,
    );
    if (value === null || value === undefined || value === "") continue;
    state[field.key] = deepParseJsonIterative(value) ?? value;
  }
  return state;
}

/** The JSON object that will be sent, assembled from the mapped fields. */
export function DecisionModelStatePreview({
  fields,
  sourceObject,
  questions,
  title = "State sent to the model",
}: {
  fields: PreviewField[];
  sourceObject: Record<string, unknown> | null;
  /** Included beside the state. OpenAI sends these on the same request. */
  questions?: unknown[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const statePreview = useMemo(() => {
    const state = buildStatePreview(fields, sourceObject);
    if (!state) return null;
    return questions ? { ...state, questions } : state;
  }, [fields, questions, sourceObject]);
  const stateSize = statePreview ? JSON.stringify(statePreview).length : 0;
  const tooLarge = stateSize > STATE_SIZE_WARNING_CHARS;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-bold">{title}</span>
          {statePreview ? (
            <span
              className={cn(
                "text-muted-foreground font-mono text-xs",
                tooLarge && "text-dark-yellow flex items-center gap-1",
              )}
            >
              {tooLarge ? <TriangleAlert className="icon-base" /> : null}
              {Object.keys(statePreview).length} field
              {Object.keys(statePreview).length === 1 ? "" : "s"} ·{" "}
              {stateSize.toLocaleString()} chars
              {tooLarge ? " · trim fields, ~32k limit" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              select a sample observation to preview
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "text-foreground-tertiary icon-base shrink-0 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>
      {open && statePreview ? (
        <div className="border-t">
          <PrettyJsonView
            json={statePreview}
            currentView="pretty"
            isLoading={false}
            showNullValues={true}
            stickyTopLevelKey={false}
            showObservationTypeBadge={false}
            scrollable={true}
            className="max-h-80 [&_.border]:border-0 [&_.rounded-sm]:rounded-none"
          />
        </div>
      ) : null}
    </div>
  );
}
