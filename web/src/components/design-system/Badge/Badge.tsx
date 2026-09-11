import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

// Border colour and radius live in the `color` and `size` variants rather than
// in the base: `badgeVariants()` is applied raw (no tailwind-merge), so two
// utilities for the same property would resolve by stylesheet order instead of
// by intent. Every variant therefore names its own.
const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center border text-xs font-normal",
  {
    variants: {
      color: {
        primary: "bg-primary text-primary-foreground border-transparent",
        neutral: "bg-tertiary text-tertiary-foreground border-transparent",
        red: "bg-light-red/60 text-dark-red/90 dark:bg-light-red/40 dark:text-dark-red/90 border-transparent",
        yellow: "bg-light-yellow/80 text-dark-yellow border-transparent",
        blue: "bg-light-blue text-dark-blue border-transparent",
        violet: "bg-light-violet text-dark-violet border-transparent",
        teal: "bg-light-teal text-dark-teal border-transparent",
        green: "bg-light-green text-dark-green border-transparent",
        /** Unfilled: a hairline outline on the page background. */
        outline: "bg-background text-foreground border-border",
      },
      size: {
        default: "gap-1 rounded-sm px-2.5 py-0.5",
        sm: "gap-1 rounded-sm px-1 py-0 leading-tight",
        // Chip sizes pair with `color="outline"`. An outlined badge reads as a
        // box rather than a highlight, so it needs interior space the filled
        // sizes do not — and a softer radius to match its own border.
        chip: "gap-1.5 rounded-md px-2 py-1",
        chipSm: "gap-1 rounded-md px-1.5 py-0.5 leading-tight",
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
