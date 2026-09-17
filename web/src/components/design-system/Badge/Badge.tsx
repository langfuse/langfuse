import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex h-5.5 w-fit max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs leading-none font-normal",
  {
    variants: {
      color: {
        primary: "border-border bg-transparent text-foreground-secondary",
        emphasis: "border-transparent bg-tertiary/60 text-foreground-secondary",
        error:
          "border-transparent bg-light-red/60 text-dark-red/90 dark:bg-light-red/40 dark:text-dark-red/90",
        warning: "border-transparent bg-light-yellow/80 text-dark-yellow",
        success: "border-transparent bg-light-green text-dark-green",
      },
    },
    defaultVariants: {
      color: "primary",
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
  ...props
}: BadgeShellProps) {
  const Component = asChild ? Slot : "span";

  return <Component className={badgeVariants({ color })} {...props} />;
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
      {label && <span className="text-muted-foreground shrink-0">{label}</span>}
      <span className="truncate" title={title ?? text}>
        {text}
      </span>
      {TrailingIcon && (
        <TrailingIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0",
            trailingIconTone === "link" && "text-link",
          )}
        />
      )}
    </BadgeShell>
  );
}
