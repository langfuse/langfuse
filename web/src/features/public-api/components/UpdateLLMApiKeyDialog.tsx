/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type ComponentProps } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  CreateLLMApiKeyForm,
  type LlmApiKeyListItem,
  type LlmConnectionFormOwner,
} from "./CreateLLMApiKeyForm";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";

export function UpdateLLMApiKeyDialog({
  owner,
  initialApiKey,
  onClose,
  children,
}: {
  owner: LlmConnectionFormOwner;
  /** Opens the dialog on mount for this connection. */
  initialApiKey?: LlmApiKeyListItem;
  /** Called when the dialog closes, dismissed or saved. */
  onClose?: () => void;
  children: ComponentProps<
    typeof DialogController<LlmApiKeyListItem>
  >["children"];
}) {
  const uiCustomization = useUiCustomization();

  return (
    <DialogController<LlmApiKeyListItem>
      initialState={() => initialApiKey}
      onDismiss={onClose}
      renderDialog={({ state: apiKey, closeDialog }) => (
        <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
          <DialogHeader>
            <DialogTitle>Update LLM Connection</DialogTitle>
          </DialogHeader>
          <CreateLLMApiKeyForm
            key={apiKey.id}
            owner={owner}
            onSuccess={() => {
              closeDialog();
              onClose?.();
            }}
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
