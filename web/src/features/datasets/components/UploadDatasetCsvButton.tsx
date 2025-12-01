import { UploadIcon } from "lucide-react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useState } from "react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ActionButton } from "@/src/components/ActionButton";
import { CsvUploadDialog } from "@/src/features/datasets/components/CsvUploadDialog";

export const UploadDatasetCsvButton = (props: {
  projectId: string;
  datasetId: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();

  return (
    <CsvUploadDialog
      open={hasAccess && open}
      onOpenChange={setOpen}
      projectId={props.projectId}
      datasetId={props.datasetId}
    >
      <DialogTrigger asChild className="hidden md:flex">
        <ActionButton
          variant="outline"
          className={props.className}
          disabled={!hasAccess}
          hasAccess={hasAccess}
          onClick={() => capture("dataset_item:upload_csv_button_click")}
          icon={<UploadIcon className="h-4 w-4" aria-hidden="true" />}
        >
          Upload CSV
        </ActionButton>
      </DialogTrigger>
    </CsvUploadDialog>
  );
};
