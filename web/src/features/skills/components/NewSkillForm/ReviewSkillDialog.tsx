import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { type Skill } from "@langfuse/shared";
import { type NewSkillFormSchemaType } from "./validation";
import DiffViewer from "@/src/components/DiffViewer";

type ReviewSkillDialogProps = {
  initialSkill: Skill;
  isLoading: boolean;
  children: React.ReactNode;
  onConfirm: () => void;
  getNewSkillValues: () => NewSkillFormSchemaType;
};

export const ReviewSkillDialog: React.FC<ReviewSkillDialogProps> = (props) => {
  const { initialSkill, children, getNewSkillValues, onConfirm, isLoading } =
    props;
  const [newSkillValue, setNewSkillValues] =
    React.useState<NewSkillFormSchemaType | null>(null);
  const [open, setOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setNewSkillValues(getNewSkillValues());
    }
  }, [open, setNewSkillValues, getNewSkillValues]);

  const newMetadata = JSON.stringify(
    JSON.parse(newSkillValue?.metadata ?? "{}"),
    null,
    2,
  );

  return (
    <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Review Skill Changes</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-medium">{initialSkill.name}</span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="max-h-[80vh] max-w-(--breakpoint-xl) space-y-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-base font-medium">Instructions</h3>
                  <DiffViewer
                    oldString={initialSkill.instructions}
                    newString={newSkillValue?.instructions ?? ""}
                    oldLabel={`Previous instructions (v${initialSkill.version})`}
                    newLabel="New instructions (draft)"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-base font-medium">Metadata</h3>
                  <DiffViewer
                    oldString={JSON.stringify(initialSkill.metadata, null, 2)}
                    newString={newMetadata ?? "failed"}
                    oldLabel={`Previous metadata (v${initialSkill.version})`}
                    newLabel="New metadata (draft)"
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="flex flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="min-w-32"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={isLoading}
            variant={newSkillValue?.isActive ? "destructive" : "default"}
            className="min-w-32"
          >
            Save new version
            {newSkillValue?.isActive ? " and promote to production" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
