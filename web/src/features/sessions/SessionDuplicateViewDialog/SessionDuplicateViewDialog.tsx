import { useId } from "react";
import { useForm } from "react-hook-form";
import { type TableViewPresetDomain } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";

export function SessionDuplicateViewDialog({
  view,
  canEdit,
  isPending,
  error,
  onSubmit,
}: {
  view: Pick<TableViewPresetDomain, "id" | "name">;
  canEdit: boolean;
  isPending: boolean;
  error: string | undefined;
  onSubmit: (name: string) => Promise<void>;
}) {
  const formId = useId();
  const form = useForm({
    defaultValues: { name: `${view.name} (copy)` },
    mode: "onChange",
  });
  return (
    <Dialog
      title="Duplicate view"
      actions={[
        {
          label: "Save view",
          type: "submit",
          form: formId,
          loading: isPending,
          disabled: !canEdit || isPending || !form.formState.isValid,
        },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async ({ name }) => {
            if (!canEdit || isPending) return;
            await onSubmit(name);
          })}
        >
          <Form.Field label="View name">
            {({ id }) => (
              <Input
                id={id}
                {...form.register("name", {
                  setValueAs: (value: string) => value.trim(),
                  required: true,
                })}
                autoFocus
              />
            )}
          </Form.Field>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </form>
      </Dialog.Body>
    </Dialog>
  );
}
