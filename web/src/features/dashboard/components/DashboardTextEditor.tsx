import { useId, useState } from "react";
import { DashboardTextContentSchema } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";

export function DashboardTextEditor({
  initialValue,
  onSave,
}: {
  initialValue: { title: string; content: string };
  onSave: (value: { title: string; content: string }) => void;
}) {
  const formId = useId();
  const [value, setValue] = useState(initialValue);
  const canSave = Boolean(value.title.trim() || value.content.trim());

  return (
    <Dialog
      title="Text tile"
      actions={[
        { label: "Save", type: "submit", form: formId, disabled: !canSave },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          className="ph-no-capture flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) onSave({ ...value, title: value.title.trim() });
          }}
        >
          <FormField
            label="Heading"
            description="Optional heading for this section."
          >
            {({ id }) => (
              <Input
                id={id}
                maxLength={
                  DashboardTextContentSchema.shape.title.maxLength ?? undefined
                }
                value={value.title}
                onChange={(event) =>
                  setValue({ ...value, title: event.target.value })
                }
              />
            )}
          </FormField>
          <FormField
            label="Note"
            description="Plain text. Line breaks are preserved."
          >
            {({ id }) => (
              <Textarea
                id={id}
                maxLength={
                  DashboardTextContentSchema.shape.content.maxLength ??
                  undefined
                }
                rows={8}
                value={value.content}
                onChange={(event) =>
                  setValue({ ...value, content: event.target.value })
                }
              />
            )}
          </FormField>
        </form>
      </Dialog.Body>
    </Dialog>
  );
}
