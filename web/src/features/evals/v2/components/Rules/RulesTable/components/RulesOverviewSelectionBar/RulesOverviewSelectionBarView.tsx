import { Pause, Play, Trash2 } from "@langfuse/icons";
import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import { Button } from "@/src/components/ui/button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

export function RulesOverviewSelectionBarView({
  selectedCount,
  hasWriteAccess,
  statusChangePending,
  deletePending,
  onClear,
  onEnable,
  onDisable,
  onConfirmDelete,
}: {
  selectedCount: number;
  hasWriteAccess: boolean;
  statusChangePending: boolean;
  deletePending: boolean;
  onClear: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onConfirmDelete: () => Promise<unknown>;
}) {
  return (
    <ConfirmationDialogController<number>
      title="Delete evaluation rules?"
      text={(count) =>
        `This permanently deletes ${count} rule${count === 1 ? "" : "s"} and its evaluator assignments.`
      }
      confirmLabel="Delete"
      variant="destructive"
      loading={deletePending}
      onConfirm={async () => {
        await onConfirmDelete();
      }}
    >
      {({ openDialog }) => (
        <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasWriteAccess || statusChangePending}
            onClick={onEnable}
          >
            <Play size="base" color="default" __rawClassName="mr-2" /> Enable
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasWriteAccess || statusChangePending}
            onClick={onDisable}
          >
            <Pause size="base" color="default" __rawClassName="mr-2" /> Disable
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasWriteAccess}
            onClick={() => openDialog(selectedCount)}
          >
            <Trash2 size="base" color="default" __rawClassName="mr-2" /> Delete
          </Button>
        </OverviewSelectionBar>
      )}
    </ConfirmationDialogController>
  );
}
