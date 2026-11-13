import { useState } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";

type ModernSessionSaveViewDialogContentProps = {
  isSaving: boolean;
  onSave: (viewName: string) => void;
  error?: string;
};

export function ModernSessionSaveViewDialogContent({
  isSaving,
  onSave,
  error,
}: ModernSessionSaveViewDialogContentProps) {
  const [viewName, setViewName] = useState("");
  const saveView = () => onSave(viewName.trim());

  return (
    <Dialog
      title="Save as new view"
      actions={[
        {
          label: "Save view",
          loading: isSaving,
          disabled: !viewName.trim() || isSaving,
          onClick: saveView,
        },
      ]}
    >
      <Dialog.Body>
        <div>
          <label
            htmlFor="modern-session-view-name"
            className="mb-2 block text-sm font-bold"
          >
            View name
          </label>
          <Input
            id="modern-session-view-name"
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder="Name this view"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && viewName.trim() && !isSaving) {
                saveView();
              }
            }}
          />
        </div>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
