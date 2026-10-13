import { X } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type TagProps = {
  text: string;
  /** Muted text after the value, e.g. `(current)`. */
  secondaryText?: string;
  title?: string;
  /** Shows a remove button after the text. */
  onRemove?: () => void;
  removeDisabled?: boolean;
};

/** A selected value or label: filled, mono, with an optional remove button. */
export function Tag({
  text,
  secondaryText,
  title,
  onRemove,
  removeDisabled,
}: TagProps) {
  return (
    <BadgeShell color="filled" font="mono" size="md" title={title}>
      <span
        className="min-w-0 truncate py-0.5"
        title={title ? undefined : text}
      >
        {text}
      </span>
      {secondaryText && (
        <span className="text-foreground-tertiary shrink-0 py-0.5">
          {secondaryText}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          disabled={removeDisabled}
          aria-label={`Remove ${text}`}
          className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm disabled:cursor-not-allowed"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <X className="icon-sm" />
        </button>
      )}
    </BadgeShell>
  );
}
