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
      | "sourceUnavailableMessage"
    >)
  | { mode: "read-only" }
);

function ReadOnlyVariableMapping({
  mappings,
}: Pick<VariableMappingProps, "mappings">) {
  if (mappings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This prompt has no variables.
      </p>
    );
  }

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

/** Prompt-variable mappings in editable setup or read-only saved state. */
export function VariableMapping(props: VariableMappingProps) {
  return props.mode === "editable" ? (
    <EditableVariableMapping {...props} />
  ) : (
    <ReadOnlyVariableMapping mappings={props.mappings} />
  );
}
