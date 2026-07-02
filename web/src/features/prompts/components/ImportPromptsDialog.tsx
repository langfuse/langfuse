import { useRef, useState } from "react";
import { Download, Upload, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type ImportItem = {
  name: string;
  type?: "text" | "chat";
  prompt: string | unknown[];
  config?: unknown;
  tags?: string[];
  labels?: string[];
  commitMessage?: string;
};

type ImportResult = {
  name: string;
  success: boolean;
  error?: string;
};

const IMPORT_MAX = 500;

function validateImportPayload(raw: unknown): ImportItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("File must contain a JSON array of prompts.");
  }
  if (raw.length === 0) {
    throw new Error("File contains an empty array.");
  }
  if (raw.length > IMPORT_MAX) {
    throw new Error(
      `File contains ${raw.length} prompts — maximum per import is ${IMPORT_MAX}. Split the file and import in batches.`,
    );
  }
  return raw.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item at index ${i} is not an object.`);
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== "string" || obj.name.trim() === "") {
      throw new Error(`Item at index ${i} is missing a valid "name" field.`);
    }
    if (obj.prompt === undefined) {
      throw new Error(`Item "${obj.name}" is missing a "prompt" field.`);
    }
    if (obj.type !== undefined && obj.type !== "text" && obj.type !== "chat") {
      throw new Error(
        `Item "${obj.name}" has an invalid "type" value. Must be "text" or "chat".`,
      );
    }
    return obj as ImportItem;
  });
}

const ImportPromptsDialogContent: React.FC<{
  projectId: string;
  onClose: () => void;
}> = ({ projectId, onClose }) => {
  const capture = usePostHogClientCapture();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ImportItem[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const utils = api.useUtils();
  const importMutation = api.prompts.importBulk.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      void utils.prompts.invalidate();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setParsedItems(null);
    setResults(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") throw new Error("Failed to read file.");
        const raw = JSON.parse(text) as unknown;
        const items = validateImportPayload(raw);
        setParsedItems(items);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Failed to parse file.",
        );
        setParsedItems(null);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleImport = () => {
    if (!parsedItems) return;
    capture("prompts:bulk_import_submit", { count: parsedItems.length });
    importMutation.mutate({ projectId, prompts: parsedItems });
  };

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;
  const isDone = results !== null;

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {!isDone ? (
          <>
            <p className="text-muted-foreground text-sm">
              Upload a JSON file exported from Langfuse. Each prompt will be
              created as a new version if the name already exists.
            </p>
            <div
              className="border-border text-muted-foreground hover:border-primary hover:text-primary flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-sm transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8" />
              <span>{fileName ? fileName : "Click to select a JSON file"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {parseError && (
              <p className="text-destructive text-sm">{parseError}</p>
            )}

            {parsedItems && (
              <p className="text-muted-foreground text-sm">
                {parsedItems.length} prompt
                {parsedItems.length !== 1 ? "s" : ""} ready to import.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Import complete — {successCount} succeeded, {failCount} failed.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border p-2 text-sm">
              {results!.map((r) => (
                <div key={r.name} className="flex items-start gap-2 py-1">
                  {r.success ? (
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <XCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono">{r.name}</span>
                  {r.error && (
                    <span className="text-muted-foreground ml-auto text-xs">
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {!isDone ? (
          <Button
            onClick={handleImport}
            disabled={!parsedItems || importMutation.isPending}
            className="w-full"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              "Import"
            )}
          </Button>
        ) : (
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        )}
      </DialogFooter>
    </>
  );
};

export const ImportPromptsButton: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-1 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] min-h-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import prompts</DialogTitle>
        </DialogHeader>
        <ImportPromptsDialogContent
          projectId={projectId}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
