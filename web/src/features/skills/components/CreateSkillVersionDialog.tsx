import { useStore } from "zustand";
import { Save, TriangleAlert } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";

export function CreateSkillVersionDialog({
  store,
  name,
  isFirstVersion,
  isSaving,
  disabled,
  onConfirm,
}: {
  store: SkillEditorStore;
  name: string;
  isFirstVersion: boolean;
  isSaving: boolean;
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const originalName = useStore(store, (state) =>
    state.baseVersion === null ? null : state.name,
  );
  const commitMessage = useStore(store, (state) => state.commitMessage);
  const setCommitMessage = useStore(
    store,
    (state) => state.actions.setCommitMessage,
  );

  return (
    <Dialog
      title={isFirstVersion ? "Create skill" : "Create new version"}
      actions={[
        {
          label: isFirstVersion ? "Create skill" : "Create version",
          icon: Save,
          loading: isSaving,
          disabled,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex flex-col gap-4">
          <p className="text-muted-foreground">
            {isFirstVersion ? (
              <>
                Create <strong>{name}</strong> as a new skill using the current
                files.
              </>
            ) : (
              <>
                Commit the current draft of <strong>{name}</strong> as an
                immutable version.
              </>
            )}
          </p>
          {isFirstVersion && originalName ? (
            <Alert variant="warning" icon={TriangleAlert}>
              <Alert.Title>You are duplicating this skill</Alert.Title>
              <Alert.Description>
                This creates <strong>{name}</strong> as a separate skill,
                starting at version 1. <strong>{originalName}</strong> stays
                unchanged.
              </Alert.Description>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="skill-version-note">Version note</Label>
            <p className="text-muted-foreground text-sm">
              Describe the changes in this version to make the history easier to
              understand.
            </p>
            <Textarea
              id="skill-version-note"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Add version note…"
              rows={5}
              autoFocus
            />
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
