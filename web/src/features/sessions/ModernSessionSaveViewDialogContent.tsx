import { useState } from "react";
import { type z } from "zod";
import { type SessionViewInputSchema } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";

type SessionViewInput = z.infer<typeof SessionViewInputSchema>;

type ModernSessionSaveViewDialogContentProps = {
  isSaving: boolean;
  onSave: (viewName: string, ownership: SessionViewInput["ownership"]) => void;
  allowedOwnerships: SessionViewInput["ownership"][];
  showOwnership: boolean;
  error?: string;
};

export function ModernSessionSaveViewDialogContent({
  isSaving,
  onSave,
  error,
  allowedOwnerships,
  showOwnership,
}: ModernSessionSaveViewDialogContentProps) {
  const canSavePrivate = allowedOwnerships.includes("PRIVATE");
  const canSaveProject = allowedOwnerships.includes("PROJECT");
  const [viewName, setViewName] = useState("");
  const [ownership, setOwnership] = useState<SessionViewInput["ownership"]>(
    canSavePrivate ? "PRIVATE" : "PROJECT",
  );
  const canSave = ownership === "PRIVATE" ? canSavePrivate : canSaveProject;
  const saveView = () => {
    if (!canSave || isSaving || !viewName.trim()) return;
    onSave(viewName.trim(), ownership);
  };

  return (
    <Dialog
      title="Save as new view"
      actions={[
        {
          label: "Save view",
          loading: isSaving,
          disabled: !viewName.trim() || isSaving || !canSave,
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
        {showOwnership && (
          <>
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
                ? "Only you can see and edit this view. Private views cannot be used by annotation queues."
                : "Shared with the project. Anyone with project-view write permission can edit it, including for all queues using it."}
            </p>
          </>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
