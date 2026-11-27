/* eslint-disable @repo/component-file-structure */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent, X } from "@langfuse/icons";
import { type ComponentPropsWithoutRef } from "react";

const tagVariants = cva(
  "inline-flex h-5 w-fit max-w-full min-w-0 shrink-0 items-center gap-1 rounded-sm border px-1.5 font-mono text-xs leading-none font-normal",
  {
    variants: {
      status: {
        /** Translucent, so the chip stays visible on muted, hovered and selected rows. */
        default:
          "border-transparent bg-foreground/5 text-foreground-secondary dark:bg-foreground/10",
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

export const markerColors = {
  foreground: "bg-foreground",
  pink: "bg-pink-500/80 dark:bg-pink-400/80",
  amber: "bg-amber-500/80 dark:bg-amber-400/80",
  orange: "bg-orange-500/80 dark:bg-orange-400/80",
  emerald: "bg-emerald-500/80 dark:bg-emerald-400/80",
  yellow: "bg-yellow-500/80 dark:bg-yellow-400/80",
  green: "bg-green-500/80 dark:bg-green-400/80",
  blue: "bg-blue-500/80 dark:bg-blue-400/80",
  purple: "bg-purple-500/80 dark:bg-purple-400/80",
  violet: "bg-violet-500/80 dark:bg-violet-400/80",
  teal: "bg-teal-500/80 dark:bg-teal-400/80",
} as const;

const markerVariants = cva("size-2 shrink-0 rounded-full", {
  variants: { color: markerColors },
});

type TagProps = {
  text: string;
  /** Muted text after the value, e.g. `(current)`. */
  secondaryText?: string;
  /** Color of the leading dot. */
  color?: NonNullable<VariantProps<typeof markerVariants>["color"]>;
  /** Shown before the text. */
  icon?: IconComponent;
  /** Warning and error tint the chip; default keeps the filled look. */
  status?: TagShellProps["status"];
  /** Shows a remove button after the text. */
  remove?: { onRemove: () => void; disabled?: boolean };
};

/** A selected value or label: filled, mono, with an optional remove button. */
export function Tag({
  text,
  secondaryText,
  color,
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
      {color && <span aria-hidden className={markerVariants({ color })} />}
      {Icon && <Icon size="sm" color="tertiary" aria-hidden />}
      <span
        className="min-w-0 truncate py-0.5"
        title={[text, secondaryText].filter(Boolean).join(" ")}
      >
        {text}
        {secondaryText && (
          <span className="text-foreground-tertiary ml-1">{secondaryText}</span>
        )}
      </span>
      {remove && (
        <button
          type="button"
          disabled={remove.disabled}
          aria-label={`Remove ${text}`}
          className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm disabled:cursor-not-allowed"
          onClick={handleRemoveClick}
        >
          <X size="sm" />
        </button>
      )}
    </TagShell>
  );
}
