/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { PencilIcon } from "lucide-react";
import { type RouterOutputs } from "@/src/utils/api";

type LlmApiKeyListItem = RouterOutputs["llmApiKey"]["all"]["data"][number];

export function UpdateLLMApiKeyDialog({
  apiKey,
  projectId,
  open,
  onOpenChange,
}: {
  apiKey: LlmApiKeyListItem;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uiCustomization = useUiCustomization();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <PencilIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90%] min-w-[40vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Update LLM Connection</DialogTitle>
        </DialogHeader>
        {open && (
          <CreateLLMApiKeyForm
            projectId={projectId}
            onSuccess={() => onOpenChange(false)}
            customization={uiCustomization}
            mode="update"
            existingKey={apiKey}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
