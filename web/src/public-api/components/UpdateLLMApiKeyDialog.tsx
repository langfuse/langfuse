import { type ComponentProps } from "react";
import { DialogController } from "@/src/app/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import {
  CreateLLMApiKeyForm,
  type LlmApiKeyListItem,
  type LlmConnectionFormOwner,
} from "./CreateLLMApiKeyForm";
import { useUiCustomization } from "@/src/ee/app/branding";

export function UpdateLLMApiKeyDialog({
  owner,
  children,
}: {
  owner: LlmConnectionFormOwner;
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
            owner={owner}
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
