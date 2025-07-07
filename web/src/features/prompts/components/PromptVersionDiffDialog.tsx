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
import { type Prompt } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import { FileDiffIcon } from "lucide-react";

type PromptVersionDiffDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  leftPrompt: Prompt;
  rightPrompt: Prompt;
};

// Create a word-based diff that preserves JSON structure
const createSmartDiff = (
  oldPrompt: Prompt,
  newPrompt: Prompt,
): { oldString: string; newString: string } => {
  if (oldPrompt.type === "text" || newPrompt.type === "text") {
    return {
      oldString:
        oldPrompt.type === "text"
          ? (oldPrompt.prompt as string)
          : JSON.stringify(oldPrompt.prompt, null, 2),
      newString:
        newPrompt.type === "text"
          ? (newPrompt.prompt as string)
          : JSON.stringify(newPrompt.prompt, null, 2),
    };
  }

  const formatMessages = (messages: any[]) =>
    JSON.stringify(
      messages.map((m) =>
        Object.fromEntries(
          Object.entries(m).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
      null,
      2,
    );

  return {
    oldString: formatMessages(oldPrompt.prompt as any[]),
    newString: formatMessages(newPrompt.prompt as any[]),
  };
};

export const PromptVersionDiffDialog: React.FC<PromptVersionDiffDialogProps> = (
  props,
) => {
  const { leftPrompt, rightPrompt, isOpen, setIsOpen } = props;

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
          title="Compare with selected prompt"
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
            Changes v{leftPrompt.version} → v{rightPrompt.version}
          </DialogTitle>

          <DialogDescription className="flex items-center gap-2">
            <span className="font-medium">Prompt {leftPrompt.name}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-base font-medium">Content</h3>
                <DiffViewer
                  {...createSmartDiff(leftPrompt, rightPrompt)}
                  oldLabel={`v${leftPrompt.version}`}
                  newLabel={`v${rightPrompt.version}`}
                  oldSubLabel={leftPrompt.commitMessage ?? undefined}
                  newSubLabel={rightPrompt.commitMessage ?? undefined}
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
