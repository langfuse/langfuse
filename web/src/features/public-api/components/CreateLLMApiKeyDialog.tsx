import { PlusIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { CreateLLMApiKeyForm } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { useTranslation } from "react-i18next";

export function CreateLLMApiKeyDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const projectId = useProjectIdFromURL();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:create",
  });
  const uiCustomization = useUiCustomization();

  if (!hasAccess) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          {t("project.settings.llmConnections.addLlmConnection")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {t("project.settings.llmConnections.newLlmConnection")}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <CreateLLMApiKeyForm
            projectId={projectId}
            onSuccess={() => setOpen(false)}
            customization={uiCustomization}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
