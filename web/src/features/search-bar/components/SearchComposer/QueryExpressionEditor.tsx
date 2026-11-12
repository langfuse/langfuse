import * as React from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Textarea } from "@/src/components/ui/textarea";
import { type ScoreTypeContext } from "../../lib/adapter";
import { type FieldRegistry } from "../../lib/fields";
import { validateQuery } from "../../lib/validate";

export function QueryExpressionEditor({
  initialValue,
  registry,
  scoreTypes,
  onApply,
  onClose,
}: {
  initialValue: string;
  registry: FieldRegistry;
  scoreTypes: ScoreTypeContext | undefined;
  onApply: (value: string) => boolean;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [stale, setStale] = React.useState(false);
  const validation = validateQuery(value, scoreTypes, registry);
  const errors = validation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  return (
    <Dialog
      title="Edit query"
      size="lg"
      actions={[
        {
          label: "Apply",
          disabled: !validation.valid,
          onClick: () => {
            if (onApply(value)) onClose();
            else setStale(true);
          },
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex min-h-0 flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm">
            Query
            <Textarea
              aria-label="Complete query expression"
              aria-invalid={!validation.valid}
              className="h-72 max-h-[50vh] resize-none font-mono text-xs"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          {errors.map((diagnostic, index) => (
            <p key={index} role="alert" className="text-destructive text-sm">
              {diagnostic.message}
            </p>
          ))}
          {stale ? (
            <p role="alert" className="text-destructive text-sm">
              The query changed while editing. Close and reopen this editor to
              continue.
            </p>
          ) : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
