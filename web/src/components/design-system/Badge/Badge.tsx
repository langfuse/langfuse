import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center rounded-sm border pb-px text-xs leading-none font-normal",
  {
    variants: {
      color: {
        primary: "border-border bg-transparent text-foreground-secondary",
        red: "border-transparent bg-light-red/60 text-dark-red/90 dark:bg-light-red/40 dark:text-dark-red/90",
        yellow: "border-transparent bg-light-yellow/80 text-dark-yellow",
        blue: "border-transparent bg-light-blue text-dark-blue",
        violet: "border-transparent bg-light-violet text-dark-violet",
        teal: "border-transparent bg-light-teal text-dark-teal",
        green: "border-transparent bg-light-green text-dark-green",
      },
      size: {
        default: "h-5.5 gap-1.5 pr-1.5 pl-2",
        sm: "h-4.5 gap-1 px-1.5",
      },
    },
    defaultVariants: {
      color: "primary",
      size: "default",
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
  ...props
}: BadgeShellProps) {
  const Component = asChild ? Slot : "span";

  return <Component className={badgeVariants({ color, size })} {...props} />;
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
  trailingIcon: TrailingIcon,
  trailingIconTone = "default",
  ...props
}: BadgeProps) {
  return (
    <BadgeShell color={color} {...props}>
      {label && <span className="shrink-0">{label}</span>}
      <span className="truncate" title={title ?? text}>
        {text}
      </span>
      {TrailingIcon && (
        <TrailingIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0",
            trailingIconTone === "link"
              ? "text-foreground-tertiary -ml-0.5"
              : "text-foreground-tertiary",
          )}
        />
      )}
    </BadgeShell>
  );
}
