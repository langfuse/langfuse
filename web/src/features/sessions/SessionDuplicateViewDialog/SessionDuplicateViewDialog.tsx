import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import {
  type SessionViewInputSchema,
  type TableViewPresetDomain,
} from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";

type SessionViewInput = z.infer<typeof SessionViewInputSchema>;

export function SessionDuplicateViewDialog({
  view,
  canEdit,
  isPending,
  error,
  onSubmit,
  allowedOwnerships,
}: {
  view: Pick<TableViewPresetDomain, "id" | "name">;
  canEdit: boolean;
  isPending: boolean;
  error: string | undefined;
  onSubmit: (
    name: string,
    ownership: SessionViewInput["ownership"],
  ) => Promise<void>;
  allowedOwnerships: SessionViewInput["ownership"][];
}) {
  const canSavePrivate = allowedOwnerships.includes("PRIVATE");
  const canSaveProject = allowedOwnerships.includes("PROJECT");
  const formId = useId();
  const [ownership, setOwnership] = useState<SessionViewInput["ownership"]>(
    canSavePrivate ? "PRIVATE" : "PROJECT",
  );
  const canSave = ownership === "PRIVATE" ? canSavePrivate : canSaveProject;
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
          disabled:
            !canEdit || !canSave || isPending || !form.formState.isValid,
        },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async ({ name }) => {
            if (!canEdit || !canSave || isPending) return;
            await onSubmit(name, ownership);
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
          <RadioCardGroup<SessionViewInput["ownership"]>
            aria-label="View ownership"
            value={ownership}
            onValueChange={setOwnership}
            options={[
              ...(canSavePrivate
                ? [{ value: "PRIVATE" as const, label: "Private view" }]
                : []),
              ...(canSaveProject
                ? [{ value: "PROJECT" as const, label: "Project view" }]
                : []),
            ]}
          />
          <p className="text-muted-foreground text-sm">
            {ownership === "PRIVATE"
              ? "Only you can see and edit this copy."
              : "This copy is shared with the project and can be used by annotation queues."}
          </p>
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
