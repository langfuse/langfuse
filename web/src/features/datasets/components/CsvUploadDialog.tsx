import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { type CsvPreviewResult } from "@/src/features/datasets/lib/csvHelpers";
import { PreviewCsvImport } from "@/src/features/datasets/components/PreviewCsvImport";
import { UploadDatasetCsv } from "@/src/features/datasets/components/UploadDatasetCsv";

type CsvUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  datasetId: string;
  children?: React.ReactNode;
};

export function CsvUploadDialog({
  open,
  onOpenChange,
  projectId,
  datasetId,
  children,
}: CsvUploadDialogProps) {
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      // Reset state when dialog closes
      setPreview(null);
      setCsvFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children}
      <DialogContent className="flex h-[80dvh] max-w-7xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Upload CSV
            <span className="text-lg font-normal text-muted-foreground">
              {csvFile ? ` - ${csvFile.name}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>
        {preview ? (
          <PreviewCsvImport
            preview={preview}
            csvFile={csvFile}
            projectId={projectId}
            datasetId={datasetId}
            setCsvFile={setCsvFile}
            setPreview={setPreview}
            setOpen={handleOpenChange}
          />
        ) : (
          <UploadDatasetCsv setPreview={setPreview} setCsvFile={setCsvFile} />
        )}
      </DialogContent>
    </Dialog>
  );
}
