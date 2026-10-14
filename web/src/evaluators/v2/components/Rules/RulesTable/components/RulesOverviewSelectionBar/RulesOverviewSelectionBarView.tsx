import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { ConfirmDialog } from "@/src/app/design-system/legacy-primitives/confirm-dialog";
import { OverviewSelectionBar } from "@/src/evaluators/v2/components/OverviewSelectionBar/OverviewSelectionBar";

export function RulesOverviewSelectionBarView({
  selectedCount,
  hasWriteAccess,
  statusChangePending,
  deletePending,
  deleteDialogOpen,
  onClear,
  onEnable,
  onDisable,
  onDelete,
  onDeleteDialogOpenChange,
  onConfirmDelete,
}: {
  selectedCount: number;
  hasWriteAccess: boolean;
  statusChangePending: boolean;
  deletePending: boolean;
  deleteDialogOpen: boolean;
  onClear: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  return (
    <>
      <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusChangePending}
          onClick={onEnable}
        >
          <Play className="icon-base text-icon-foreground mr-2" /> Enable
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusChangePending}
          onClick={onDisable}
        >
          <Pause className="icon-base text-icon-foreground mr-2" /> Disable
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess}
          onClick={onDelete}
        >
          <Trash2 className="icon-base text-icon-foreground mr-2" /> Delete
        </Button>
      </OverviewSelectionBar>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={onDeleteDialogOpenChange}
        title="Delete evaluation rules?"
        description={`This permanently deletes ${selectedCount} rule${selectedCount === 1 ? "" : "s"} and its evaluator assignments.`}
        confirmLabel="Delete"
        loading={deletePending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
