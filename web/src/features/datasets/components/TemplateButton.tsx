import { FileText } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionButton } from "@/src/components/ActionButton";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { TemplateForm } from "./TemplateForm";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const TemplateButton = (props: {
  projectId: string;
  datasetId: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && hasAccess) {
      capture("datasets:template_form_open");
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={hasAccess && open} onOpenChange={handleOpenChange}>
      <ActionButton
        variant="outline"
        className={props.className}
        hasAccess={hasAccess}
        onClick={() => handleOpenChange(true)}
        icon={<FileText className="h-4 w-4" aria-hidden="true" />}
      >
        Template
      </ActionButton>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Set Dataset Template</DialogTitle>
        </DialogHeader>
        <TemplateForm
          projectId={props.projectId}
          datasetId={props.datasetId}
          onFormSuccess={() => setOpen(false)}
          className="h-full overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
};
