/* eslint-disable no-nested-ternary */
import {
  Pencil,
  TextCursorInput,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { CollapsibleCard } from "@/src/features/evals/v2/components/CollapsibleCard/CollapsibleCard";
import { StateKeyNameInput } from "./StateKeyNameInput/StateKeyNameInput";

/**
 * How the mapped name is rendered: as a prompt template `{{variable}}`, or as
 * a state key for evaluators whose mapping builds a JSON object.
 */
export type VariableDisplay = "template" | "stateKey";

function VariableMappingCardHeaderContent({
  variable,
  variableDisplay = "template",
  mapping,
  isUnmapped,
  warningMessage,
}: {
  variable: string;
  variableDisplay?: VariableDisplay;
  mapping: React.ReactNode;
  isUnmapped: boolean;
  warningMessage?: string | null;
}) {
  return (
    <>
      <span className="text-primary-accent shrink-0 font-mono font-bold">
        {variableDisplay === "stateKey" ? variable : `{{${variable}}}`}
      </span>
      <span className="text-muted-foreground shrink-0">
        {variableDisplay === "stateKey" ? "from" : "maps to"}
      </span>
      {isUnmapped ? (
        <span className="text-dark-yellow flex min-w-0 items-center gap-1.5 font-bold">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>nothing yet</span>
        </span>
      ) : (
        <span className="@container flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0">{mapping}</span>
          {warningMessage ? (
            <span
              className="text-dark-yellow relative -top-px h-4 w-4 shrink-0 self-center"
              aria-label={`Warning: ${warningMessage}`}
              title={warningMessage}
            >
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
        </span>
      )}
    </>
  );
}

/** Renaming a state key: the header swaps the name for an input. */
export type VariableRenameControls = {
  isRenaming: boolean;
  onRenamingChange: (renaming: boolean) => void;
  onRename: (next: string) => void;
  validateName: (next: string) => string | null;
};

/** Presentational shell for one editable prompt-variable mapping. */
function VariableMappingCardShell({
  variable,
  variableDisplay,
  mapping,
  isUnmapped,
  warningMessage,
  isExpanded,
  isEditing,
  onExpandedChange,
  onEditingChange,
  onDelete,
  rename,
  children,
}: {
  variable: string;
  variableDisplay?: VariableDisplay;
  mapping?: React.ReactNode;
  isUnmapped: boolean;
  warningMessage?: string | null;
  isExpanded: boolean;
  isEditing: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  onDelete?: () => void;
  rename?: VariableRenameControls;
  children?: React.ReactNode;
}) {
  const isRenaming = rename?.isRenaming ?? false;
  const canToggle = !isEditing && !isRenaming;
  const bodyVisible = isExpanded || isEditing;

  return (
    <CollapsibleCard
      open={bodyVisible}
      onOpenChange={onExpandedChange}
      disabled={!canToggle}
      headerInteractive={!isRenaming}
      triggerTitle={
        isEditing
          ? "Finish editing before collapsing this mapping"
          : bodyVisible
            ? `Collapse {{${variable}}} mapping`
            : `Expand {{${variable}}} mapping`
      }
      header={
        isRenaming && rename ? (
          <StateKeyNameInput
            key={variable}
            value={variable}
            validate={rename.validateName}
            onCommit={rename.onRename}
            onCancel={() => rename.onRenamingChange(false)}
          />
        ) : (
          <VariableMappingCardHeaderContent
            variable={variable}
            variableDisplay={variableDisplay}
            mapping={mapping}
            isUnmapped={isUnmapped}
            warningMessage={warningMessage}
          />
        )
      }
      actions={
        <span className="flex shrink-0 items-center pr-1">
          {rename && !isRenaming ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={`Rename ${variable}`}
              onClick={() => rename.onRenamingChange(true)}
            >
              <TextCursorInput className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title={
              isEditing
                ? "Cancel — keep the current mapping"
                : "Change the mapping"
            }
            aria-expanded={isEditing}
            disabled={isRenaming}
            onClick={() => onEditingChange(!isEditing)}
          >
            {isEditing ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="hover:text-destructive"
              title={
                variableDisplay === "stateKey"
                  ? `Remove ${variable} from the state`
                  : `Remove {{${variable}}} from the prompt`
              }
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </span>
      }
    >
      {children}
    </CollapsibleCard>
  );
}

/** Static card shell used when a saved mapping is displayed read-only. */
function ReadOnlyVariableMappingCardShell({
  variable,
  variableDisplay,
  mapping,
}: {
  variable: string;
  variableDisplay?: VariableDisplay;
  mapping: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-md border">
      <div className="bg-secondary text-secondary-foreground flex min-h-9 min-w-0 items-center gap-2 px-3 py-1.5 text-sm">
        <VariableMappingCardHeaderContent
          variable={variable}
          variableDisplay={variableDisplay}
          mapping={mapping}
          isUnmapped={false}
        />
      </div>
    </div>
  );
}

export { ReadOnlyVariableMappingCardShell, VariableMappingCardShell };
