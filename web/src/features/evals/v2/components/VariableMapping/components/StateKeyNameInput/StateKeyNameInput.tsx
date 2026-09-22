import { useState } from "react";

import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/utils/tailwind";

/**
 * Inline editor for a state key in a mapping card header. Enter or blur
 * commits a valid name; Escape, or blurring an invalid one, keeps the old name.
 */
export function StateKeyNameInput({
  value,
  validate,
  onCommit,
  onCancel,
}: {
  value: string;
  /** Returns a problem with the candidate name, or null when it is usable. */
  validate: (next: string) => string | null;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const trimmed = draft.trim();
  const error = trimmed === value ? null : validate(trimmed);

  const commit = () => {
    if (trimmed === value || trimmed === "") {
      onCancel();
      return;
    }
    if (error) return;
    onCommit(trimmed);
  };

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => (error ? onCancel() : commit())}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-label="Field name"
        aria-invalid={Boolean(error)}
        placeholder="field_name"
        className={cn(
          "h-7 w-56 font-mono text-sm",
          error && "border-destructive",
        )}
      />
      {error ? (
        <span className="text-destructive truncate text-xs" title={error}>
          {error}
        </span>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">
          Enter to save, Esc to cancel
        </span>
      )}
    </span>
  );
}
