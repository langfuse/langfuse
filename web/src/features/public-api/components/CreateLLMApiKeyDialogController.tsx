/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import {
  CreateLLMApiKeyForm,
  type LlmConnectionFormOwner,
  type NewLlmConnectionPrefill,
} from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function CreateLLMApiKeyDialogController({
  owner,
  initialPrefill,
  onAfterClose,
  children,
}: {
  owner: LlmConnectionFormOwner;
  /** Opens the dialog on mount with these values, if the user may create. */
  initialPrefill?: NewLlmConnectionPrefill;
  /** Called after the dialog closed itself, dismissed or saved. */
  onAfterClose?: () => void;
  children: (control: {
    hasAccess: boolean;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const hasProjectAccess = useHasProjectAccess({
    projectId: owner.scope === "project" ? owner.projectId : undefined,
    scope: "llmApiKeys:create",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId:
      owner.scope === "organization" ? owner.organizationId : undefined,
    scope: "organizationLlmApiKeys:CUD",
  });
  const hasAccess =
    owner.scope === "project" ? hasProjectAccess : hasOrganizationAccess;
  const uiCustomization = useUiCustomization();
  const [formKey, setFormKey] = useState(0);
  const openPrefill = hasAccess ? initialPrefill : undefined;

  return (
    <DialogController<NewLlmConnectionPrefill>
      // Remounts once access is known, so a prefilled dialog opens.
      key={openPrefill ? "prefilled" : "empty"}
      initialState={() => openPrefill}
      onDismiss={() => {
        setFormKey((currentKey) => currentKey + 1);
        onAfterClose?.();
      }}
      renderDialog={({ state: prefill, closeDialog }) => (
        <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
          <DialogHeader>
            <DialogTitle>New LLM Connection</DialogTitle>
          </DialogHeader>
          <CreateLLMApiKeyForm
            key={formKey}
            owner={owner}
            onSuccess={() => {
              closeDialog();
              onAfterClose?.();
            }}
            customization={uiCustomization}
            prefill={prefill}
          />
        </DialogContent>
      )}
    >
      {({ openDialog }) =>
        children({ hasAccess, openDialog: () => openDialog({}) })
      }
    </DialogController>
  );
}
