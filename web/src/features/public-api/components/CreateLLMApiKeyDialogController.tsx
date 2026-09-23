import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useUiCustomization } from "@/src/ee/features/ui-customization";
import { CreateLLMApiKeyForm } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { useHasProjectAccess } from "@/src/features/rbac";

export function CreateLLMApiKeyDialogController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    hasAccess: boolean;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:create",
  });
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
            projectId={projectId}
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
