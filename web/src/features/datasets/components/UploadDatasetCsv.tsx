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
import { z } from "zod";
import { api } from "@/src/utils/api";
import { type CsvPreviewResult } from "@/src/features/datasets/lib/csvHelpers";

const ACCEPTED_FILE_TYPES = ["text/csv", "application/csv"] as const;

const FileSchema = z.object({
  type: z.enum([...ACCEPTED_FILE_TYPES]),
  size: z.number().min(1),
});

export const UploadDatasetCsv = ({
  projectId,
  datasetId,
  setPreview,
}: {
  projectId: string;
  datasetId: string;
  setPreview: (preview: CsvPreviewResult | null) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutStoreCsv = api.datasets.storeCsv.useMutation({});
  const mutPreviewCsv = api.datasets.csvPreview.useMutation({});

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

    try {
      const fileBuffer = await file.arrayBuffer();
      const fileUint8Array = new Uint8Array(fileBuffer);
      const base64Buffer = Buffer.from(fileUint8Array).toString("base64");

      const fileId = await mutStoreCsv.mutateAsync({
        projectId,
        datasetId,
        file: {
          buffer: base64Buffer,
          name: file.name,
          type: file.type,
        },
      });
      if (!fileId) {
        showErrorToast("Failed to parse CSV", "Memory limit exceeded");
        event.target.value = "";
        return;
      }
      const preview = await mutPreviewCsv.mutateAsync({
        projectId,
        fileId,
      });
      setPreview({ ...preview, fileId });
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
    <Card className="h-full items-center justify-center p-2">
      <CardHeader className="text-center">
        <CardTitle className="text-lg">Your dataset has no items</CardTitle>
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
  );
};
