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
import DiffViewer from "@/src/components/DiffViewer";
import { FileDiffIcon } from "lucide-react";

type SkillVersionDiffDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  leftSkill: Skill;
  rightSkill: Skill;
};

export const SkillVersionDiffDialog: React.FC<SkillVersionDiffDialogProps> = (
  props,
) => {
  const { leftSkill, rightSkill, isOpen, setIsOpen } = props;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          type="button"
          size="icon"
          className="h-7 w-7 px-0"
          onClick={(event) => {
            event.stopPropagation();
          }}
          title="Compare with selected skill"
        >
          <FileDiffIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent
        size="xl"
        // prevent event bubbling up and triggering the row's click handler
        onClick={(event) => event.stopPropagation()}
        onPointerDownOutside={(e) => {
          setIsOpen(false);
          e.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Changes v{leftSkill.version} → v{rightSkill.version}
          </DialogTitle>

          <DialogDescription className="flex items-center gap-2">
            <span className="font-medium">Skill {leftSkill.name}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-base font-medium">Instructions</h3>
                <DiffViewer
                  oldString={leftSkill.instructions}
                  newString={rightSkill.instructions}
                  oldLabel={`v${leftSkill.version}`}
                  newLabel={`v${rightSkill.version}`}
                  oldSubLabel={leftSkill.commitMessage ?? undefined}
                  newSubLabel={rightSkill.commitMessage ?? undefined}
                />
              </div>
              <div>
                <h3 className="mb-2 text-base font-medium">Metadata</h3>
                <DiffViewer
                  oldString={JSON.stringify(leftSkill.metadata, null, 2)}
                  newString={JSON.stringify(rightSkill.metadata, null, 2)}
                  oldLabel={`v${leftSkill.version}`}
                  newLabel={`v${rightSkill.version}`}
                />
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
