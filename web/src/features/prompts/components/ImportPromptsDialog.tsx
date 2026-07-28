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
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { z } from "zod";

const importItemSchema = z.object({
  name: z.string().min(1, "name must be a non-empty string"),
  type: z.enum(["text", "chat"]).optional(),
  prompt: z.union([z.string(), z.array(z.unknown())]),
  config: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  commitMessage: z.string().nullish(),
});

type ImportItem = z.infer<typeof importItemSchema>;

const IMPORT_MAX = 500;

const importPayloadSchema = z
  .array(importItemSchema)
  .min(1, "File contains an empty array.")
  .max(
    IMPORT_MAX,
    `File contains more than ${IMPORT_MAX} prompts — maximum per import is ${IMPORT_MAX}. Split the file and import in batches.`,
  );

function validateImportPayload(raw: unknown): ImportItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("File must contain a JSON array of prompts.");
  }
  const result = importPayloadSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message ?? "Invalid import payload.");
  }
  return result.data;
}

type ImportResult = {
  name: string;
  success: boolean;
  error?: string;
};

type ImportState =
  | { step: "idle" }
  | { step: "parsed"; fileName: string; items: ImportItem[] }
  | { step: "error"; fileName: string; error: string }
  | { step: "done"; results: ImportResult[] };

const ImportPromptsDialogContent: React.FC<{
  projectId: string;
  onClose: () => void;
}> = ({ projectId, onClose }) => {
  const capture = usePostHogClientCapture();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "idle" });

  const utils = api.useUtils();
  const importMutation = api.prompts.importBulk.useMutation({
    onSuccess: (data) => {
      setState({ step: "done", results: data.results });
      utils.prompts.invalidate();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ step: "idle" });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") throw new Error("Failed to read file.");
        const raw = JSON.parse(text) as unknown;
        const items = validateImportPayload(raw);
        setState({ step: "parsed", fileName: file.name, items });
      } catch (err) {
        setState({
          step: "error",
          fileName: file.name,
          error: err instanceof Error ? err.message : "Failed to parse file.",
        });
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleImport = () => {
    if (state.step !== "parsed") return;
    capture("prompts:bulk_import_submit", { count: state.items.length });
    importMutation.mutate({ projectId, prompts: state.items });
  };

  if (state.step === "done") {
    const successCount = state.results.filter((r) => r.success).length;
    const failCount = state.results.filter((r) => !r.success).length;

    return (
      <>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">
              Import complete — {successCount} succeeded, {failCount} failed.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border p-2 text-sm">
              {state.results.map((r) => (
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
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  const fileName =
    state.step === "parsed"
      ? state.fileName
      : state.step === "error"
        ? state.fileName
        : null;
  const parsedItems = state.step === "parsed" ? state.items : null;
  const parseError = state.step === "error" ? state.error : null;

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Upload a JSON file exported from Langfuse. Each prompt will be created
          as a new version if the name already exists.
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

        {parseError && <p className="text-destructive text-sm">{parseError}</p>}

        {parsedItems && (
          <p className="text-muted-foreground text-sm">
            {parsedItems.length} prompt
            {parsedItems.length !== 1 ? "s" : ""} ready to import.
          </p>
        )}
      </DialogBody>

      <DialogFooter>
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
      </DialogFooter>
    </>
  );
};

export const ImportPromptsButton: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
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
