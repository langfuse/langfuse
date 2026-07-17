import * as React from "react";
import { cn } from "@/src/utils/tailwind";

export interface InlineEditTextProps {
  value: string;
  /** Called with the trimmed value when a change is committed (Enter/blur). */
  onSave: (value: string) => void;
  /** Render as plain text without any edit affordance. */
  disabled?: boolean;
  /** Revert instead of committing an empty value. */
  required?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Click-to-edit text: renders as text (with a hover/focus pencil affordance),
 * turns into an input on click. Enter or blur commits, Escape reverts.
 * Inherits the surrounding typography so it can sit inside headings, labels,
 * or table cells.
 */
export const InlineEditText = ({
  value,
  onSave,
  disabled = false,
  required = false,
  placeholder,
  "aria-label": ariaLabel,
}: InlineEditTextProps) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  // Keep the callback ref stable so typing does not reattach it and reselect the input.
  const focusInput = React.useCallback((input: HTMLInputElement | null) => {
    if (!input) return;

    input.focus();
    input.select();
  }, []);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    if (!next && required) return;
    onSave(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  if (disabled) {
    return <span className="wrap-break-word">{value}</span>;
  }

  if (editing) {
    return (
      <input
        ref={focusInput}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "Edit text"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        // size is the fallback width where field-sizing is unsupported
        size={Math.max(draft.length, 4)}
        // h-[1lh] + align-bottom keep the box exactly one text line tall in
        // both modes so swapping display/edit never changes layout height.
        className="ring-input focus:ring-ring field-sizing-content h-[1lh] max-w-full min-w-16 rounded-sm border-0 bg-transparent p-0 px-1 align-bottom ring-1 outline-hidden [font:inherit]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      aria-label={ariaLabel ?? "Edit text"}
      title="Click to edit"
      className="hover:bg-accent/50 focus-visible:ring-ring inline-flex h-[1lh] max-w-full items-center rounded-sm px-1 text-left align-bottom [font:inherit] focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <span
        title={value || placeholder}
        className={cn("truncate", !value && "text-muted-foreground")}
      >
        {value || placeholder}
      </span>
    </button>
  );
};
