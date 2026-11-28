import { useId, useState } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";

export function WidgetNameDialog({
  title,
  fieldLabel,
  initialName,
  submitLabel,
  onConfirm,
  onClose,
  returnFocus,
}: {
  title: string;
  fieldLabel: "Tab name" | "Widget name";
  initialName: string;
  submitLabel: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(initialName);
  const name = draft.trim();

  return (
    <Dialog
      title={title}
      size="xs"
      noCapture
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocus();
      }}
      actions={[
        { label: submitLabel, type: "submit", form: formId, disabled: !name },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name) return;
            onConfirm(name);
            onClose();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {fieldLabel}
            <Input
              aria-label={fieldLabel}
              value={draft}
              autoFocus
              maxLength={200}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
        </form>
      </Dialog.Body>
    </Dialog>
  );
}
