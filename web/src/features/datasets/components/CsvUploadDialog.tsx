import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { PreviewCsvImport } from "@/src/features/datasets/components/PreviewCsvImport";
import { UploadDatasetCsv } from "@/src/features/datasets/components/UploadDatasetCsv";
import type { CsvPreviewResult } from "@/src/features/datasets/lib/csv/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { File } from "lucide-react";

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
          <DialogTitle className="flex items-center gap-2">
            Upload CSV
            {csvFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <File className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  {csvFile.name}
                </TooltipContent>
              </Tooltip>
            )}
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
