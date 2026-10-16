/* eslint-disable @repo/component-file-structure */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon, X } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

const tagVariants = cva(
  "inline-flex h-5 w-fit max-w-full min-w-0 shrink-0 items-center gap-1 rounded-sm border px-1.5 pb-px font-mono text-xs leading-none font-normal",
  {
    variants: {
      status: {
        default: "border-transparent bg-muted text-foreground-secondary",
        warning:
          "border-yellow-100 bg-yellow-50 text-yellow-800 dark:border-transparent dark:bg-light-yellow/80 dark:text-dark-yellow",
        error:
          "border-red-100 bg-red-50 text-red-800 dark:border-transparent dark:bg-light-red/40 dark:text-dark-red/90",
      },
    },
    defaultVariants: {
      status: "default",
    },
  },
);

type TagShellProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "className" | "style"
> &
  VariantProps<typeof tagVariants> & {
    asChild?: boolean;
  };

/**
 * Low-level primitive for tag-shaped chips with custom content, e.g. a `+N`
 * overflow count or a clickable tag. Prefer `Tag` in most cases!
 * This export is against the file-structure rules of the codebase,
 * it was added intentionally and should not be changed!
 */
export function TagShell({ asChild = false, status, ...props }: TagShellProps) {
  const Component = asChild ? Slot : "span";

  return <Component className={tagVariants({ status })} {...props} />;
}

type TagProps = {
  text: string;
  /** Muted text after the value, e.g. `(current)`. */
  secondaryText?: string;
  /** Shown before the text. */
  icon?: LucideIcon;
  /** Warning and error tint the chip; default keeps the filled look. */
  status?: TagShellProps["status"];
  /** Shows a remove button after the text. */
  remove?: { onRemove: () => void; disabled?: boolean };
};

/** A selected value or label: filled, mono, with an optional remove button. */
export function Tag({
  text,
  secondaryText,
  icon: Icon,
  status,
  remove,
}: TagProps) {
  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    remove?.onRemove();
  };

  return (
    <TagShell status={status}>
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
    </TagShell>
  );
}
