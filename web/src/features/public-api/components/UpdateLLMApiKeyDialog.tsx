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
  onAfterClose,
  children,
}: {
  owner: LlmConnectionFormOwner;
  /** Opens the dialog on mount for this connection. */
  initialApiKey?: LlmApiKeyListItem;
  /** Called after the dialog closed itself, dismissed or saved. */
  onAfterClose?: () => void;
  children: ComponentProps<
    typeof DialogController<LlmApiKeyListItem>
  >["children"];
}) {
  const uiCustomization = useUiCustomization();

  return (
    <DialogController<LlmApiKeyListItem>
      initialState={() => initialApiKey}
      onDismiss={onAfterClose}
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
              onAfterClose?.();
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
