import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { type Prompt } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import { FileDiffIcon } from "lucide-react";

type PromptVersionDiffDialogProps = {
  leftPrompt: Prompt;
  rightPrompt: Prompt;
  onClose: () => void;
};

export const PromptVersionDiffDialog: React.FC<PromptVersionDiffDialogProps> = (
  props,
) => {
  const { leftPrompt, rightPrompt, onClose } = props;
  const [open, setOpen] = React.useState<boolean>(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) onClose();
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
          title="Compare with selected prompt"
        >
          <FileDiffIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-w-screen-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            Changes v{leftPrompt.version} → v{rightPrompt.version}
          </DialogTitle>

          <DialogDescription className="flex items-center gap-2">
            <span className="font-medium">Prompt {leftPrompt.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[80vh] max-w-screen-xl space-y-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-base font-medium">Content</h3>
                <DiffViewer
                  oldString={
                    leftPrompt.type === "chat"
                      ? JSON.stringify(leftPrompt.prompt, null, 2)
                      : (leftPrompt.prompt as string)
                  }
                  newString={
                    rightPrompt.type === "chat"
                      ? JSON.stringify(rightPrompt.prompt, null, 2)
                      : (rightPrompt.prompt as string)
                  }
                  oldLabel={`v${leftPrompt.version}`}
                  newLabel={`v${rightPrompt.version}`}
                />
              </div>
              <div>
                <h3 className="mb-2 text-base font-medium">Config</h3>
                <DiffViewer
                  oldString={JSON.stringify(leftPrompt.config, null, 2)}
                  newString={JSON.stringify(rightPrompt.config, null, 2)}
                  oldLabel={`v${leftPrompt.version}`}
                  newLabel={`v${rightPrompt.version}`}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row">
          <Button
            onClick={() => {
              setOpen(false);
              onClose();
            }}
            className="w-full"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
