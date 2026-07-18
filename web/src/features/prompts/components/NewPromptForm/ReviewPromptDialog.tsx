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
import { cn } from "@/src/utils/tailwind";

type ReviewPromptDialogProps = {
  initialPrompt: Prompt;
  isLoading: boolean;
  children: React.ReactNode;
  onConfirm: () => void;
  getNewPromptValues: () => NewPromptFormSchemaType;
};

// Render each message as readable text so newlines inside the content show as
// actual line breaks instead of escaped "\n" sequences (as JSON.stringify would).
const formatMessages = (messages: any[], excludeKeys: string[] = []) => {
  return messages
    .map((m) =>
      Object.entries(m)
        .filter(
          ([k]) =>
            !excludeKeys.includes(k) &&
            (k !== "type" || m.type === "placeholder"),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) =>
          typeof value === "string"
            ? `${key}: ${value}`
            : `${key}: ${JSON.stringify(value, null, 2)}`,
        )
        .join("\n"),
    )
    .join("\n\n");
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

  // Only let the Content section fill the body height when it actually has a
  // diff. Otherwise the "No changes" state would reserve a full viewport and
  // push the Config diff below the fold (common for config-only edits).
  const contentUnchanged = initialPromptContent === newPromptContent;

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
          {/* Content fills the body height when it has a diff; scroll to reach Config */}
          <div
            className={cn(
              "flex shrink-0 flex-col",
              !contentUnchanged && "h-full",
            )}
          >
            <h3 className="mb-2 text-base font-medium">Content</h3>
            <DiffViewer
              oldString={initialPromptContent}
              newString={newPromptContent}
              oldLabel={`Previous content (v${initialPrompt.version})`}
              newLabel="New content (draft)"
              fillContainerHeight={!contentUnchanged}
              className={cn(!contentUnchanged && "min-h-0 flex-1")}
            />
          </div>
          <div className="flex shrink-0 flex-col">
            <h3 className="mb-2 text-base font-medium">Config</h3>
            <DiffViewer
              oldString={JSON.stringify(initialPrompt.config, null, 2)}
              newString={newConfig ?? "failed"}
              oldLabel={`Previous config (v${initialPrompt.version})`}
              newLabel="New config (draft)"
            />
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
            variant={newPromptValue?.isActive ? "destructive" : "default"}
            className="min-w-32"
          >
            Save new version
            {newPromptValue?.isActive ? " and promote to production" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
