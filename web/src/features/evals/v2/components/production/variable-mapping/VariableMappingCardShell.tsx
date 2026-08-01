import { ChevronDown, Pencil, Trash2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

/** Presentational shell for one prompt-variable mapping. */
function VariableMappingCardShell({
  variable,
  mapping,
  isUnmapped,
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
  isExpanded: boolean;
  isEditing: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}) {
  const canToggle = !isEditing;
  return (
    <div className="bg-card flex flex-col rounded-md border">
      <div
        className={cn(
          "bg-muted/30 flex min-w-0 items-center gap-2 rounded-t-md px-3 py-1.5 text-sm",
          isExpanded || isEditing ? "border-b" : "rounded-b-md",
          canToggle && "cursor-pointer",
        )}
        role={canToggle ? "button" : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-expanded={canToggle ? isExpanded : undefined}
        onClick={(event) => {
          if (!canToggle || (event.target as Element).closest("button")) return;
          onExpandedChange(!isExpanded);
        }}
        onKeyDown={(event) => {
          if (!canToggle || (event.target as Element).closest("button")) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onExpandedChange(!isExpanded);
          }
        }}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
            !isExpanded && "-rotate-90",
            !canToggle && "invisible",
          )}
        />
        <span className="text-primary-accent shrink-0 font-mono font-bold">{`{{${variable}}}`}</span>
        <span className="text-muted-foreground shrink-0">pulls from</span>
        {isUnmapped ? (
          <span className="text-dark-yellow flex min-w-0 items-center gap-1.5 font-bold">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>nothing yet</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1">{mapping}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center">
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
          {onDelete && (
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
          )}
        </span>
      </div>
      {(isExpanded || isEditing) && children}
    </div>
  );
}

export { VariableMappingCardShell };
