import { Braces } from "lucide-react";

import { evalVariableColumnLabel } from "@/src/features/evals/v2/fns/variableMapping/evalVariableColumnLabel";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";
import {
  EditableVariableMapping,
  type EditableVariableMappingProps,
} from "./components/EditableVariableMapping/EditableVariableMapping";
import { VariableMappingBinding } from "./components/VariableMappingBinding/VariableMappingBinding";
import { ReadOnlyVariableMappingCardShell } from "./components/VariableMappingCardShell";

type VariableMappingProps = {
  mappings: Array<{ variable: string; fieldState: VariableFieldState }>;
} & (
  | ({ mode: "editable" } & Pick<
      EditableVariableMappingProps,
      | "activeMapping"
      | "onActiveMappingChange"
      | "onChangeField"
      | "onDeleteVariable"
      | "sourceObject"
      | "hasMatchingObservations"
      | "unvalidatedSourceColumnIds"
      | "sourceUnavailableMessage"
    >)
  | { mode: "read-only" }
);

function ReadOnlyVariableMapping({
  mappings,
}: Pick<VariableMappingProps, "mappings">) {
  return (
    <div className="flex flex-col gap-4">
      {mappings.map((mapping) => (
        <ReadOnlyVariableMappingCardShell
          key={mapping.variable}
          variable={mapping.variable}
          mapping={
            <VariableMappingBinding
              columnLabel={
                evalVariableColumnLabel(mapping.fieldState.selectedColumnId) ??
                ""
              }
              jsonSelector={mapping.fieldState.jsonSelector}
            />
          }
        />
      ))}
    </div>
  );
}

function EmptyVariableMapping({ mode }: Pick<VariableMappingProps, "mode">) {
  return (
    <div className="border-border bg-muted/20 flex flex-col items-center justify-center gap-2 rounded-md border px-6 py-8 text-center">
      <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
        <Braces className="size-4" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold">No variables to map</p>
        <p className="text-muted-foreground text-xs">
          {mode === "editable"
            ? "Add a {{variable}} to the prompt to map evaluation data."
            : "This prompt does not contain any variables."}
        </p>
      </div>
    </div>
  );
}

/** Prompt-variable mappings in editable setup or read-only saved state. */
export function VariableMapping(props: VariableMappingProps) {
  if (props.mappings.length === 0) {
    return <EmptyVariableMapping mode={props.mode} />;
  }

  return props.mode === "editable" ? (
    <EditableVariableMapping {...props} />
  ) : (
    <ReadOnlyVariableMapping mappings={props.mappings} />
  );
}
