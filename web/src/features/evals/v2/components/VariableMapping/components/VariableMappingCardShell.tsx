import { Pencil, Trash2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { CollapsibleCard } from "@/src/features/evals/v2/components/CollapsibleCard/CollapsibleCard";

function VariableMappingCardHeaderContent({
  variable,
  mapping,
  isUnmapped,
  warningMessage,
}: {
  variable: string;
  mapping: React.ReactNode;
  isUnmapped: boolean;
  warningMessage?: string | null;
}) {
  return (
    <>
      <span className="text-primary-accent shrink-0 font-mono font-bold">{`{{${variable}}}`}</span>
      <span className="text-muted-foreground shrink-0">maps to</span>
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

/** Presentational shell for one editable prompt-variable mapping. */
function VariableMappingCardShell({
  variable,
  mapping,
  isUnmapped,
  warningMessage,
  isExpanded,
  isEditing,
  onExpandedChange,
  onEditingChange,
  onDelete,
  children,
}: {
  variable: string;
  mapping?: React.ReactNode;
  isUnmapped: boolean;
  warningMessage?: string | null;
  isExpanded: boolean;
  isEditing: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}) {
  const canToggle = !isEditing;
  const bodyVisible = isExpanded || isEditing;

  return (
    <CollapsibleCard
      open={bodyVisible}
      onOpenChange={onExpandedChange}
      disabled={!canToggle}
      triggerTitle={
        isEditing
          ? "Finish editing before collapsing this mapping"
          : bodyVisible
            ? `Collapse {{${variable}}} mapping`
            : `Expand {{${variable}}} mapping`
      }
      header={
        <VariableMappingCardHeaderContent
          variable={variable}
          mapping={mapping}
          isUnmapped={isUnmapped}
          warningMessage={warningMessage}
        />
      }
      actions={
        <span className="flex shrink-0 items-center pr-1">
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
              title={`Remove {{${variable}}} from the prompt`}
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
  mapping,
}: {
  variable: string;
  mapping: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-md border">
      <div className="bg-secondary text-secondary-foreground flex min-h-9 min-w-0 items-center gap-2 px-3 py-1.5 text-sm">
        <VariableMappingCardHeaderContent
          variable={variable}
          mapping={mapping}
          isUnmapped={false}
        />
      </div>
    </div>
  );
}

export { ReadOnlyVariableMappingCardShell, VariableMappingCardShell };
