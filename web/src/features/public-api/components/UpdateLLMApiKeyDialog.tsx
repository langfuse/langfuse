import { type ComponentProps } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";
import { useUiCustomization } from "@/src/ee/features/ui-customization";
import { type RouterOutputs } from "@/src/utils/api";

type LlmApiKeyListItem = RouterOutputs["llmApiKey"]["all"]["data"][number];

export function UpdateLLMApiKeyDialog({
  projectId,
  children,
}: {
  projectId: string;
  children: ComponentProps<
    typeof DialogController<LlmApiKeyListItem>
  >["children"];
}) {
  const uiCustomization = useUiCustomization();

  return (
    <DialogController<LlmApiKeyListItem>
      renderDialog={({ state: apiKey, closeDialog }) => (
        <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
          <DialogHeader>
            <DialogTitle>Update LLM Connection</DialogTitle>
          </DialogHeader>
          <CreateLLMApiKeyForm
            key={apiKey.id}
            projectId={projectId}
            onSuccess={closeDialog}
            customization={uiCustomization}
            mode="update"
            existingKey={apiKey}
          />
        </DialogContent>
      )}
    >
      {children}
    </DialogController>
  );
}
