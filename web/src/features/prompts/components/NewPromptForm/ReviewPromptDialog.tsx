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
import { type NewPromptFormSchemaType } from "./validation";
import DiffViewer from "@/src/components/DiffViewer";

type ReviewPromptDialogProps = {
  initialPrompt: Prompt;
  isLoading: boolean;
  children: React.ReactNode;
  onConfirm: () => void;
  getNewPromptValues: () => NewPromptFormSchemaType;
};

const formatMessages = (messages: any[], excludeKeys: string[] = []) => {
  return JSON.stringify(
    messages.map((m) =>
      Object.fromEntries(
        Object.entries(m)
          .filter(
            ([k]) =>
              !excludeKeys.includes(k) &&
              (k !== "type" || m.type === "placeholder"),
          )
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
    null,
    2,
  );
};

export const ReviewPromptDialog: React.FC<ReviewPromptDialogProps> = (
  props,
) => {
  const { initialPrompt, children, getNewPromptValues, onConfirm, isLoading } =
    props;
  const [newPromptValue, setNewPromptValues] =
    React.useState<NewPromptFormSchemaType | null>(null);
  const [open, setOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setNewPromptValues(getNewPromptValues());
    }
  }, [open, setNewPromptValues, getNewPromptValues]);

  const initialPromptContent =
    initialPrompt.type === "text"
      ? (initialPrompt.prompt as string)
      : formatMessages(initialPrompt.prompt as any[]);

  const newPromptContent =
    initialPrompt.type === "text"
      ? (newPromptValue?.textPrompt ?? "")
      : formatMessages(newPromptValue?.chatPrompt ?? [], ["id"]);

  const newConfig = JSON.stringify(
    JSON.parse(newPromptValue?.config ?? "{}"),
    null,
    2,
  );

  return (
    <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Review Prompt Changes</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-medium">{initialPrompt.name}</span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="max-h-[80vh] max-w-screen-xl space-y-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-base font-medium">Content</h3>
                  <DiffViewer
                    oldString={initialPromptContent}
                    newString={newPromptContent}
                    oldLabel={`Previous content (v${initialPrompt.version})`}
                    newLabel="New content (draft)"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-base font-medium">Config</h3>
                  <DiffViewer
                    oldString={JSON.stringify(initialPrompt.config, null, 2)}
                    newString={newConfig ?? "failed"}
                    oldLabel={`Previous config (v${initialPrompt.version})`}
                    newLabel="New config (draft)"
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
            className="min-w-[8rem]"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={isLoading}
            variant={newPromptValue?.isActive ? "destructive" : "default"}
            className="min-w-[8rem]"
          >
            Save new version
            {newPromptValue?.isActive ? " and promote to production" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
