import { type ReactNode, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { CreatePromptSchema } from "@langfuse/shared";
import { z } from "zod";

type ImportItem = z.infer<typeof CreatePromptSchema>;

const IMPORT_MAX = 500;

const importPayloadSchema = z
  .array(CreatePromptSchema)
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
  | { step: "parsed"; file: File; items: ImportItem[] }
  | { step: "error"; file?: File; error: string }
  | { step: "done"; results: ImportResult[] };

const ImportPromptsDialogContent: React.FC<{
  projectId: string;
  onClose: () => void;
}> = ({ projectId, onClose }) => {
  const capture = usePostHogClientCapture();
  const [state, setState] = useState<ImportState>({ step: "idle" });

  const utils = api.useUtils();
  const importMutation = api.prompts.importBulk.useMutation({
    onSuccess: (data) => {
      setState({ step: "done", results: data.results });
      utils.prompts.invalidate();
    },
  });

  const handleFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setState({ step: "idle" });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") throw new Error("Failed to read file.");
        const raw = JSON.parse(text) as unknown;
        const items = validateImportPayload(raw);
        setState({ step: "parsed", file, items });
      } catch (err) {
        setState({
          step: "error",
          file,
          error: err instanceof Error ? err.message : "Failed to parse file.",
        });
      }
    };
    reader.readAsText(file);
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
              {state.results.map((r, index) => (
                <div
                  key={`${r.name}-${index}`}
                  className="flex items-start gap-2 py-1"
                >
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

  const selectedFile =
    state.step === "parsed" || state.step === "error" ? state.file : undefined;
  const parsedItems = state.step === "parsed" ? state.items : null;
  const parseError = state.step === "error" ? state.error : null;

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Upload a JSON file exported from Langfuse. Each prompt will be created
          as a new version if the name already exists.
        </p>
        <p className="text-muted-foreground text-sm">
          The production label is not imported. The newest imported version is
          automatically labeled latest.
        </p>
        <Dropzone
          accept={{ "application/json": [".json"] }}
          isDisabled={importMutation.isPending}
          maxFiles={1}
          maxSize={undefined}
          minSize={undefined}
          onDrop={handleFiles}
          onError={(error) => setState({ step: "error", error: error.message })}
          src={selectedFile ? [selectedFile] : undefined}
          variant="panel"
        />

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

export function ImportPromptsButtonDialogController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to import prompts." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
  };

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
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
}
