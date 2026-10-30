import React from "react";
import { type Prompt } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import DiffViewer from "@/src/components/DiffViewer";
import { type NewPromptFormSchemaType } from "./validation";

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
    <DialogController
      renderDialog={() => (
        <Dialog
          size="xxl"
          title="Review Prompt Changes"
          closeLabel="Cancel"
          actions={[
            {
              label: newPromptValue?.isActive
                ? "Save new version and promote to production"
                : "Save new version",
              loading: isLoading,
              onClick: onConfirm,
              variant: newPromptValue?.isActive ? "destructive" : "default",
            },
          ]}
        >
          <Dialog.Body>
            <p className="font-bold">{initialPrompt.name}</p>
            <div>
              <h3 className="mb-2 text-base font-bold">Content</h3>
              <DiffViewer
                oldString={initialPromptContent}
                newString={newPromptContent}
                oldLabel={`Previous content (v${initialPrompt.version})`}
                newLabel="New content (draft)"
              />
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold">Config</h3>
              <DiffViewer
                oldString={JSON.stringify(initialPrompt.config, null, 2)}
                newString={newConfig ?? "failed"}
                oldLabel={`Previous config (v${initialPrompt.version})`}
                newLabel="New config (draft)"
              />
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <span
          className="contents"
          onClick={() => {
            setNewPromptValues(getNewPromptValues());
            openDialog();
          }}
        >
          {children}
        </span>
      )}
    </DialogController>
  );
};
