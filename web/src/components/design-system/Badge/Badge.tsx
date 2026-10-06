import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center rounded-sm border pb-px text-xs leading-none font-normal",
  {
    variants: {
      size: {
        default: "h-5.5 gap-1.5 pr-1.5 pl-2",
        md: "h-5 gap-1 px-1.5",
        sm: "h-4.5 gap-1 px-1.5",
      },
      color: {
        primary: "border-border bg-transparent text-foreground-secondary",
        red: "border-red-100 bg-red-50 text-red-800 dark:border-transparent dark:bg-light-red/40 dark:text-dark-red/90",
        yellow:
          "border-yellow-100 bg-yellow-50 text-yellow-800 dark:border-transparent dark:bg-light-yellow/80 dark:text-dark-yellow",
        blue: "border-transparent bg-light-blue text-dark-blue",
        violet: "border-transparent bg-light-violet text-dark-violet",
        teal: "border-transparent bg-light-teal text-dark-teal",
        green: "border-transparent bg-light-green text-dark-green",
        ghost: "border-0 bg-transparent px-0 text-foreground-secondary",
        filled: "border-transparent bg-muted text-foreground-secondary",
      },
      interactive: {
        true: "decoration-border-contrast underline decoration-dashed decoration-1 underline-offset-[3px]",
        false: "",
      },
    },
    defaultVariants: {
      color: "primary",
      size: "default",
      interactive: false,
    },
  },
);

type BadgeShellProps = Omit<ComponentPropsWithoutRef<"span">, "className"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  };

/**
 * Low-level primitive for specialized badges that require custom content.
 * Prefer `Badge` in most cases!
 * This export is against the file-structure rules of the codebase,
 * it was added intentionally and should not be changed!
 */
export function BadgeShell({
  asChild = false,
  color,
  size,
  interactive,
  ...props
}: BadgeShellProps) {
  const Component = asChild ? Slot : "span";

  return (
    <Component
      className={cn(badgeVariants({ color, size, interactive }))}
      {...props}
    />
  );
}

type BadgeProps = Omit<BadgeShellProps, "asChild" | "children"> & {
  text: string;
  /** Key shown muted before the value, e.g. `latency` before `0.71s`. */
  label?: string;
  trailingIcon?: LucideIcon;
  /** Link badges tint the arrow so the affordance reads before the hover. */
  trailingIconTone?: "default" | "link";
};

export function Badge({
  color,
  text,
  label,
  title,
  interactive,
  trailingIcon: TrailingIcon,
  trailingIconTone = "default",
  ...props
}: BadgeProps) {
  return (
    <BadgeShell color={color} {...props}>
      {label && <span className="shrink-0 py-0.5">{label}:</span>}
      <span
        className={cn(
          "overflow-x-clip overflow-y-visible py-0.5 text-ellipsis whitespace-nowrap",
          interactive &&
            "decoration-border-contrast underline decoration-dashed decoration-1 underline-offset-[3px]",
        )}
        title={title ?? (interactive ? undefined : text)}
      >
        {text}
      </span>
      {TrailingIcon && (
        <TrailingIcon
          aria-hidden
          className={cn(
            "icon-sm shrink-0",
            trailingIconTone === "link"
              ? "text-foreground-tertiary -ml-0.5"
              : "text-foreground-tertiary",
          )}
        />
      )}
    </BadgeShell>
  );
}
