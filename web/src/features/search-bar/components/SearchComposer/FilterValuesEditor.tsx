import * as React from "react";
import { Copy, X } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";
import { type ScoreTypeContext } from "../../lib/adapter";
import { type FieldRegistry } from "../../lib/fields";
import { removeToken } from "../../lib/edits";
import { replaceFilterValues } from "../../lib/fns/replaceFilterValues";
import { validateQuery } from "../../lib/validate";
import { QueryExpressionEditor } from "./QueryExpressionEditor";

const PAGE_SIZE = 100;

export function FilterValuesEditor({
  initialQuery,
  token,
  registry,
  scoreTypes,
  onApply,
  onClose,
}: {
  initialQuery: string;
  token: {
    from: number;
    to: number;
    raw: string;
    summary: { label: string; values: readonly string[] };
  };
  registry: FieldRegistry;
  scoreTypes: ScoreTypeContext | undefined;
  onApply: (query: string) => boolean;
  onClose: () => void;
}) {
  const [values, setValues] = React.useState([...token.summary.values]);
  const [search, setSearch] = React.useState("");
  const [additionalValues, setAdditionalValues] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [notice, setNotice] = React.useState("");
  const [expandedQuery, setExpandedQuery] = React.useState<string | null>(null);
  const replacement = replaceFilterValues(token.raw, values, registry);
  const nextQuery =
    replacement === null
      ? removeToken(initialQuery, token, registry)
      : initialQuery.slice(0, token.from) +
        replacement +
        initialQuery.slice(token.to);
  const validation = validateQuery(nextQuery, scoreTypes, registry);
  const matching = values.flatMap((value, index) =>
    value.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ? [{ value, index }]
      : [],
  );
  const additions = additionalValues
    .split(/\r?\n/)
    .filter((value) => value.length > 0);

  if (expandedQuery !== null)
    return (
      <QueryExpressionEditor
        initialValue={expandedQuery}
        registry={registry}
        scoreTypes={scoreTypes}
        onApply={onApply}
        onClose={onClose}
      />
    );

  return (
    <Dialog
      title="Edit filter values"
      size="md"
      actions={[
        {
          label: values.length === 0 ? "Remove filter" : "Apply",
          disabled: !validation.valid || additions.length > 0,
          disabledReason:
            additions.length > 0
              ? "Add or clear the pending values before applying."
              : undefined,
          onClick: () => {
            if (onApply(nextQuery)) onClose();
            else
              setNotice(
                "The query changed while editing. Close and reopen this editor to continue.",
              );
          },
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex min-h-0 flex-col gap-3">
          <p className="text-muted-foreground text-sm">{token.summary.label}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm" aria-live="polite">
              {values.length} values selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={Copy}
              text="Copy values"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(values.join("\n"));
                  setNotice("Values copied.");
                } catch {
                  setNotice(
                    "Could not copy values. You can copy the complete expression from Edit full query.",
                  );
                }
              }}
            />
          </div>
          <Input
            aria-label="Find selected values"
            placeholder="Find selected values"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          <div className="max-h-[30vh] min-h-20 overflow-y-auto rounded-md border">
            <ul aria-label="Selected filter values" className="divide-y">
              {matching.slice(0, visibleCount).map(({ value, index }) => (
                <li key={index} className="flex items-center gap-2 px-3 py-1">
                  <span className="min-w-0 flex-1 font-mono text-xs break-words whitespace-pre-wrap">
                    {value || '""'}
                  </span>
                  <IconButton
                    icon={X}
                    label={`Remove value ${value || '""'}`}
                    size="sm"
                    onClick={() =>
                      setValues((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            {matching.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                {values.length === 0
                  ? "Applying will remove this filter."
                  : "No matching values."}
              </p>
            ) : null}
            {matching.length > visibleCount ? (
              <div className="flex justify-center border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  text={`Show ${Math.min(PAGE_SIZE, matching.length - visibleCount)} more`}
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                />
              </div>
            ) : null}
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Add values
            <Textarea
              aria-label="Add values, one per line"
              placeholder="One value per line"
              className="max-h-32 resize-y font-mono text-xs"
              value={additionalValues}
              onChange={(event) => setAdditionalValues(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              text="Add values"
              variant="secondary"
              size="sm"
              disabled={additions.length === 0}
              onClick={() => {
                setValues((current) => [...current, ...additions]);
                setAdditionalValues("");
              }}
            />
            <Button
              text="Edit full query"
              variant="text"
              size="sm"
              disabled={additions.length > 0}
              onClick={() => setExpandedQuery(nextQuery)}
            />
          </div>
          {validation.diagnostics
            .filter((diagnostic) => diagnostic.severity === "error")
            .map((diagnostic, index) => (
              <p key={index} role="alert" className="text-destructive text-sm">
                {diagnostic.message}
              </p>
            ))}
          {notice ? (
            <p role="status" className="text-muted-foreground text-sm">
              {notice}
            </p>
          ) : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
