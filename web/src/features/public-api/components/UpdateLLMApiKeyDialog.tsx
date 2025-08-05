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
  open,
  onOpenChange,
}: {
  apiKey: LlmApiKeys;
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const uiCustomization = useUiCustomization();

  // Use external state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });

  if (!hasAccess) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
        {isOpen && (
          <CreateLLMApiKeyForm
            projectId={projectId}
            onSuccess={() => setIsOpen(false)}
            customization={uiCustomization}
            mode="update"
            existingKey={apiKey}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
