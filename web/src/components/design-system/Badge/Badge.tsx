import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center rounded-sm border border-transparent text-xs font-normal",
  {
    variants: {
      color: {
        primary: "bg-primary text-primary-foreground",
        neutral: "bg-tertiary text-tertiary-foreground",
        red: "bg-light-red/60 text-dark-red/90 dark:bg-light-red/40 dark:text-dark-red/90",
        yellow: "bg-light-yellow/80 text-dark-yellow",
        blue: "bg-light-blue text-dark-blue",
        violet: "bg-light-violet text-dark-violet",
        teal: "bg-light-teal text-dark-teal",
        green: "bg-light-green text-dark-green",
      },
      size: {
        default: "gap-1 px-2.5 py-0.5",
        sm: "gap-1 px-1 py-0 leading-tight",
      },
    },
    defaultVariants: {
      color: "neutral",
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
  trailingIcon?: LucideIcon;
};

export function Badge({
  color,
  size,
  text,
  title,
  trailingIcon: TrailingIcon,
  ...props
}: BadgeProps) {
  return (
    <BadgeShell color={color} size={size} {...props}>
      <span className="truncate" title={title ?? text}>
        {text}
      </span>
      {TrailingIcon && <TrailingIcon aria-hidden className="size-3 shrink-0" />}
    </BadgeShell>
  );
}
