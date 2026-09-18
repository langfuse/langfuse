import { useStore } from "zustand";
import { Save } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";

export function CreateSkillVersionDialog({
  store,
  name,
  isFirstVersion,
  isSaving,
  onCancel,
  onConfirm,
}: {
  store: SkillEditorStore;
  name: string;
  isFirstVersion: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const commitMessage = useStore(store, (state) => state.commitMessage);
  const setCommitMessage = useStore(
    store,
    (state) => state.actions.setCommitMessage,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isFirstVersion ? "Create skill" : "Create new version"}
        </DialogTitle>
        <DialogDescription>
          {isFirstVersion ? (
            <>The skill name and description are read from SKILL.md.</>
          ) : (
            <>
              Commit the current draft of <strong>{name}</strong> as an
              immutable version.
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="ph-no-capture">
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
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" loading={isSaving} onClick={onConfirm}>
          <Save className="mr-1.5 h-4 w-4" />
          {isFirstVersion ? "Create skill" : "Create version"}
        </Button>
      </DialogFooter>
    </>
  );
}
