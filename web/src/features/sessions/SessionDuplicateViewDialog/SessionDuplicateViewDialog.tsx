import { useId, useState } from "react";
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
  const [name, setName] = useState(`${view.name} (copy)`);
  return (
    <Dialog
      title="Duplicate view"
      actions={[
        {
          label: "Save view",
          type: "submit",
          form: formId,
          loading: isPending,
          disabled: !canEdit || isPending || !name.trim(),
        },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canEdit || isPending || !name.trim()) return;
            await onSubmit(name.trim());
          }}
        >
          <Form.Field label="View name">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
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
