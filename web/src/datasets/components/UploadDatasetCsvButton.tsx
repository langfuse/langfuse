import { UploadIcon } from "lucide-react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useState } from "react";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { ActionButton } from "@/src/app/components/ActionButton";
import { CsvUploadDialog } from "@/src/datasets/components/CsvUploadDialog";

export const UploadDatasetCsvButton = (props: {
  projectId: string;
  datasetId: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

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
          disabled={!hasAccess}
          hasAccess={hasAccess}
          trackingEventName="dataset_item:upload_csv_button_click"
          icon={<UploadIcon className="icon-base" aria-hidden="true" />}
        >
          Upload CSV
        </ActionButton>
      </DialogTrigger>
    </CsvUploadDialog>
  );
};
