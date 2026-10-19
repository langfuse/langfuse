import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { type Prompt } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";

type PromptVersionDiffDialogProps = {
  leftPrompt: Prompt;
  rightPrompt: Prompt;
  closeDialog: () => void;
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

export const PromptVersionDiffDialogContent = (
  props: PromptVersionDiffDialogProps,
) => {
  const { leftPrompt, rightPrompt, closeDialog } = props;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Changes v{leftPrompt.version} → v{rightPrompt.version}
        </DialogTitle>

        <DialogDescription className="flex items-center gap-2">
          <span className="font-bold">Prompt {leftPrompt.name}</span>
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-base font-bold">Content</h3>
              <DiffViewer
                {...createSmartDiff(leftPrompt, rightPrompt)}
                oldLabel={`v${leftPrompt.version}`}
                newLabel={`v${rightPrompt.version}`}
                oldSubLabel={leftPrompt.commitMessage ?? undefined}
                newSubLabel={rightPrompt.commitMessage ?? undefined}
              />
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold">Config</h3>
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
        <Button onClick={closeDialog}>Close</Button>
      </DialogFooter>
    </>
  );
};
