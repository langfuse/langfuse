import { UploadIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ActionButton } from "@/src/components/ActionButton";
import { type CsvPreviewResult } from "@/src/features/datasets/lib/csvHelpers";
import { PreviewCsvImport } from "@/src/features/datasets/components/PreviewCsvImport";
import { UploadDatasetCsv } from "@/src/features/datasets/components/UploadDatasetCsv";
import { api } from "@/src/utils/api";

export const UploadDatasetCsvButton = (props: {
  projectId: string;
  datasetId: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();

  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: 0,
    limit: 50,
  });

  if (hasAccess && items.data?.totalDatasetItems === 0) {
    return null;
  }

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
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
      <DialogContent className="flex h-[80dvh] max-w-[80dvw] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Upload CSV</DialogTitle>
        </DialogHeader>
        {preview ? (
          <PreviewCsvImport
            preview={preview}
            csvFile={csvFile}
            projectId={props.projectId}
            datasetId={props.datasetId}
            setCsvFile={setCsvFile}
            setPreview={setPreview}
            setOpen={setOpen}
          />
        ) : (
          <UploadDatasetCsv setPreview={setPreview} setCsvFile={setCsvFile} />
        )}
      </DialogContent>
    </Dialog>
  );
};
