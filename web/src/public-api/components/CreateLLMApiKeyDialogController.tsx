import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/app/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { useUiCustomization } from "@/src/ee/app/branding";
import {
  CreateLLMApiKeyForm,
  type LlmConnectionFormOwner,
} from "@/src/public-api/components/CreateLLMApiKeyForm";
import {
  useHasOrganizationAccess,
  useHasProjectAccess,
} from "@/src/identity/access-control";

export function CreateLLMApiKeyDialogController({
  owner,
  children,
}: {
  owner: LlmConnectionFormOwner;
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

  return (
    <DialogController
      onDismiss={() => setFormKey((currentKey) => currentKey + 1)}
      renderDialog={({ closeDialog }) => (
        <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
          <DialogHeader>
            <DialogTitle>New LLM Connection</DialogTitle>
          </DialogHeader>
          <CreateLLMApiKeyForm
            key={formKey}
            owner={owner}
            onSuccess={closeDialog}
            customization={uiCustomization}
          />
        </DialogContent>
      )}
    >
      {({ openDialog }) => children({ hasAccess, openDialog })}
    </DialogController>
  );
}
