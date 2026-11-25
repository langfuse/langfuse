import { useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";
import { useSaveDashboardBlock } from "./useDashboardBlockMutations";
import { createDashboardBlockPlacementUpdate } from "./dashboard-block-placement-update";

export function DashboardBlockPositionEditor({
  block,
  projectId,
  dashboardId,
  canEdit,
  options,
  onSaved,
  onCancel,
  onPositionChanged,
}: {
  block: SavedDashboardBlock;
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  options: { value: string | null; label: string }[];
  onSaved: () => void;
  onCancel: () => void;
  onPositionChanged: () => void;
}) {
  const form = useForm<{ beforePlacementId: string | null }>({
    defaultValues: { beforePlacementId: block.beforePlacementId },
  });
  const position = useWatch({
    control: form.control,
    name: "beforePlacementId",
  });
  const formId = useId();
  const mutation = useSaveDashboardBlock({ projectId, dashboardId, onSaved });
  const valid = createDashboardBlockPlacementUpdate(block, position) !== null;
  const error = positionError(
    valid,
    mutation.error?.data?.code,
    mutation.isError,
  );
  if (!canEdit)
    return (
      <Dialog title="Editing unavailable" closeLabel="Close" noCapture>
        <Dialog.Body>
          <p className="text-muted-foreground text-sm">
            You can no longer edit this widget.
          </p>
        </Dialog.Body>
      </Dialog>
    );
  return (
    <Dialog
      title="Edit position"
      noCapture
      hideCloseButton
      requireExplicitClose={mutation.isPending}
      actions={[
        {
          label: "Cancel",
          variant: "secondary",
          disabled: mutation.isPending,
          onClick: onCancel,
        },
        {
          label: "Save position",
          type: "submit",
          form: formId,
          loading: mutation.isPending,
          disabled:
            !valid ||
            mutation.isPending ||
            position === block.beforePlacementId,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground text-sm">
          Choose where this widget appears on the dashboard.
        </p>
        <Form
          id={formId}
          actions={[]}
          density="compact"
          onSubmit={form.handleSubmit(({ beforePlacementId }) => {
            const input = createDashboardBlockPlacementUpdate(
              block,
              beforePlacementId,
            );
            if (
              !canEdit ||
              mutation.isPending ||
              !input ||
              beforePlacementId === block.beforePlacementId
            )
              return;
            mutation.mutate({ projectId, dashboardId, blockPatch: input });
          })}
        >
          <Controller
            control={form.control}
            name="beforePlacementId"
            render={({ field }) => (
              <DashboardBlockPlacement
                value={field.value}
                options={options}
                disabled={mutation.isPending}
                defaultExpanded
                onChange={(next) => {
                  if (next === field.value) return;
                  field.onChange(next);
                  onPositionChanged();
                }}
              />
            )}
          />
        </Form>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}

function positionError(
  valid: boolean,
  code: string | undefined,
  failed: boolean,
) {
  if (!valid)
    return "Edit this widget’s configuration before changing its position.";
  if (!failed) return undefined;
  if (code === "CONFLICT")
    return "This widget changed in another session. Cancel and reopen its position to see the latest version.";
  return "Could not save the position. Your selection is still here. Try again.";
}
