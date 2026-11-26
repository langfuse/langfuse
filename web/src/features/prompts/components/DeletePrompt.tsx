import { Button } from "@/src/components/ui/button";
import { Trash } from "@langfuse/icons";

import { DeletePromptDialogController } from "./DeletePromptDialogController";

export function DeletePrompt({ promptName }: { promptName: string }) {
  return (
    <DeletePromptDialogController promptName={promptName}>
      {({ disabled, onClick }) => (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={onClick}
        >
          <Trash size="sm" color="default" />
        </Button>
      )}
    </DeletePromptDialogController>
  );
}
