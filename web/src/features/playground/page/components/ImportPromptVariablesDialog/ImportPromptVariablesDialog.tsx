import { useId, useState } from "react";
import { type PromptVariable } from "@langfuse/shared";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Textarea } from "@/src/components/ui/textarea";

type ImportPromptVariablesDialogProps = {
  promptVariables: PromptVariable[];
  onImport: (values: Record<string, string>) => void;
  onClose: () => void;
};

export function ImportPromptVariablesDialog({
  promptVariables,
  onImport,
  onClose,
}: ImportPromptVariablesDialogProps) {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [json, setJson] = useState(() =>
    JSON.stringify(
      Object.fromEntries(
        promptVariables.map(({ name, value }) => [name, value]),
      ),
      null,
      2,
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Enter valid JSON.");
      return;
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      setError("Enter a JSON object with variable names as keys.");
      return;
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      setError("Enter at least one variable.");
      return;
    }

    const variableNames = new Set(promptVariables.map(({ name }) => name));
    const values: [string, string][] = [];
    for (const [name, value] of entries) {
      if (!variableNames.has(name)) {
        setError(`Unknown variable: ${name}. Use an existing prompt variable.`);
        return;
      }
      if (typeof value !== "string") {
        setError(`The value for ${name} must be a string.`);
        return;
      }
      values.push([name, value]);
    }

    onImport(Object.fromEntries(values));
    onClose();
  };

  return (
    <Dialog
      title="Import variables from JSON"
      size="md"
      actions={[{ label: "Import variables", onClick: handleImport }]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex flex-col gap-3">
          <p id={descriptionId} className="text-muted-foreground">
            Paste a JSON object with existing variable names and string values.
            Only the variables you provide will be updated. Message placeholders
            are configured separately.
          </p>
          <label htmlFor={inputId} className="text-sm">
            Variable values (JSON)
          </label>
          <Textarea
            id={inputId}
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              setError(null);
            }}
            rows={12}
            className="max-h-[50vh] min-h-48 resize-y font-mono text-xs"
            spellCheck={false}
            aria-describedby={
              error ? `${descriptionId} ${errorId}` : descriptionId
            }
            aria-invalid={error !== null}
          />
          {error && (
            <p
              id={errorId}
              role="alert"
              className="text-destructive text-sm break-words"
            >
              {error}
            </p>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
