import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";

type ModernSessionSaveViewDialogContentProps = {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (viewName: string) => void;
  error?: string;
};

export function ModernSessionSaveViewDialogContent({
  isSaving,
  onCancel,
  onSave,
  error,
}: ModernSessionSaveViewDialogContentProps) {
  const [viewName, setViewName] = useState("");
  const saveView = () => onSave(viewName.trim());

  return (
    <Dialog title="Save as new view">
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
        <div className="flex justify-end gap-2">
          <Button variant="secondary" text="Cancel" onClick={onCancel} />
          <Button
            text="Save view"
            loading={isSaving}
            disabled={!viewName.trim()}
            onClick={saveView}
          />
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
