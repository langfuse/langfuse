import { useState } from "react";
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
import { type LlmApiKeys } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { PencilIcon } from "lucide-react";

export function UpdateLLMApiKeyDialog({
  apiKey,
  projectId,
}: {
  apiKey: LlmApiKeys;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const uiCustomization = useUiCustomization();

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <PencilIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>Update LLM API key</DialogTitle>
        </DialogHeader>
        {open && (
          <CreateLLMApiKeyForm
            projectId={projectId}
            onSuccess={() => setOpen(false)}
            customization={uiCustomization}
            mode="update"
            existingKey={apiKey}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
