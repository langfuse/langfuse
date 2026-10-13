import { type LucideIcon, X } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

const statusColor = {
  default: "filled",
  warning: "yellow",
  error: "red",
} as const;

type TagProps = {
  text: string;
  /** Muted text after the value, e.g. `(current)`. */
  secondaryText?: string;
  /** Shown before the text. */
  icon?: LucideIcon;
  /** Warning and error tint the chip; default keeps the filled look. */
  status?: keyof typeof statusColor;
  /** Shows a remove button after the text. */
  remove?: { onRemove: () => void; disabled?: boolean };
};

/** A selected value or label: filled, mono, with an optional remove button. */
export function Tag({
  text,
  secondaryText,
  icon: Icon,
  status = "default",
  remove,
}: TagProps) {
  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    remove?.onRemove();
  };

  return (
    <BadgeShell color={statusColor[status]} font="mono" size="md">
      {Icon && (
        <Icon
          className="text-foreground-tertiary icon-sm shrink-0"
          aria-hidden
        />
      )}
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
