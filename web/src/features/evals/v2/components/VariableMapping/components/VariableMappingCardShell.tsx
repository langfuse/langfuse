import { Pencil, TextCursorInput, Trash2, X } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { CollapsibleCard } from "@/src/features/evals/v2/components/CollapsibleCard/CollapsibleCard";
import {
  VariableMappingCardHeaderContent,
  type VariableDisplay,
} from "./VariableMappingCardHeaderContent";
import { StateKeyNameInput } from "./StateKeyNameInput/StateKeyNameInput";

export type { VariableDisplay };

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
  const triggerTitle = (() => {
    if (isEditing) {
      return "Finish editing before collapsing this mapping";
    }
    if (bodyVisible) {
      return `Collapse {{${variable}}} mapping`;
    }
    return `Expand {{${variable}}} mapping`;
  })();

  return (
    <CollapsibleCard
      open={bodyVisible}
      onOpenChange={onExpandedChange}
      disabled={!canToggle}
      headerInteractive={!isRenaming}
      triggerTitle={triggerTitle}
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
              <TextCursorInput size="sm" color="default" />
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
              <X size="sm" color="default" />
            ) : (
              <Pencil size="sm" color="default" />
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
              <Trash2 size="sm" />
            </Button>
          ) : null}
        </span>
      }
    >
      {children}
    </CollapsibleCard>
  );
}

export { VariableMappingCardShell };
