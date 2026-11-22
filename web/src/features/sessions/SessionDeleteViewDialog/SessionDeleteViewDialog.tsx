import { type TableViewPresetDomain } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export function SessionDeleteViewDialog({
  view,
  canEdit,
  isPending,
  error,
  onDelete,
}: {
  view: Pick<TableViewPresetDomain, "id" | "name">;
  canEdit: boolean;
  isPending: boolean;
  error: string | undefined;
  onDelete: () => Promise<void>;
}) {
  const disabled = !canEdit || view.id === "messages" || isPending;
  return (
    <Dialog
      title={`Delete ${view.name}?`}
      noCapture
      actions={[
        {
          label: "Delete view",
          variant: "destructive",
          loading: isPending,
          disabled,
          onClick: async () => {
            if (disabled) return;
            await onDelete();
          },
        },
      ]}
    >
      <Dialog.Body>
        <p>
          This permanently deletes the saved view for everyone in this project.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}
