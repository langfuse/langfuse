import { X } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type TagProps = {
  text: string;
  /** Muted text after the value, e.g. `(current)`. */
  secondaryText?: string;
  /** Shows a remove button after the text. */
  remove?: { onRemove: () => void; disabled?: boolean };
};

/** A selected value or label: filled, mono, with an optional remove button. */
export function Tag({ text, secondaryText, remove }: TagProps) {
  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    remove?.onRemove();
  };

  return (
    <BadgeShell color="filled" font="mono" size="md">
      <span
        className="min-w-0 truncate py-0.5"
        title={[text, secondaryText].filter(Boolean).join(" ")}
      >
        {text}
      </span>
      {secondaryText && (
        <span className="text-foreground-tertiary shrink-0 py-0.5">
          {secondaryText}
        </span>
      )}
      {remove && (
        <button
          type="button"
          disabled={remove.disabled}
          aria-label={`Remove ${text}`}
          className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm disabled:cursor-not-allowed"
          onClick={handleRemoveClick}
        >
          <X className="icon-sm" />
        </button>
      )}
    </BadgeShell>
  );
}
