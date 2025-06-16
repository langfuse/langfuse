import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { UploadIcon } from "lucide-react";
import { useRef } from "react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { z } from "zod/v4";
import {
  type CsvPreviewResult,
  parseCsvClient,
} from "@/src/features/datasets/lib/csvHelpers";
import { DialogBody } from "@/src/components/ui/dialog";

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1 * 10; // 10MB
const ACCEPTED_FILE_TYPES = ["text/csv"] as const;

const FileSchema = z.object({
  type: z.enum([...ACCEPTED_FILE_TYPES]),
  size: z.number().min(1),
});

export const UploadDatasetCsv = ({
  setPreview,
  setCsvFile,
}: {
  setPreview: (preview: CsvPreviewResult | null) => void;
  setCsvFile: (file: File | null) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = FileSchema.safeParse(file);
    if (!result.success) {
      showErrorToast("Invalid file type", "Please select a valid CSV file");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showErrorToast("File too large", "Maximum file size is 10MB");
      event.target.value = "";
      return;
    }

    try {
      setCsvFile(file);
      const preview = await parseCsvClient(file, {
        isPreview: true,
        collectSamples: true,
      });

      if (!Boolean(preview.columns.length)) {
        showErrorToast("Invalid CSV", "CSV must have at least 1 column");
        event.target.value = "";
        return;
      }

      setPreview(preview);
    } catch (error) {
      showErrorToast(
        "Failed to parse CSV",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      event.target.value = "";
    }
  };

  return (
    <DialogBody className="border-t">
      <Card className="h-full items-center justify-center border-none">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Add items to dataset</CardTitle>
          <CardDescription>
            Add items to dataset by uploading a file, add items manually or via
            our SDKs/API
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Hidden file input */}
          <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleFileSelect}
          />

          {/* Clickable upload area */}
          <div
            className="flex max-h-full min-h-0 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-y-auto rounded-lg border border-dashed bg-secondary/50 p-4"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="h-6 w-6 text-secondary-foreground" />
            <div className="text-sm text-secondary-foreground">
              Click to select a CSV file
            </div>
          </div>
        </CardContent>
      </Card>
    </DialogBody>
  );
};
