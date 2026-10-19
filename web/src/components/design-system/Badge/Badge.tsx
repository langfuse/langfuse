/* eslint-disable @repo/component-file-structure */
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
        /** Matches the 24px entity tile next to page titles. */
        lg: "h-6 gap-1.5 px-2",
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
        /** `filled` for a chip on a muted or accent surface, e.g. a selected or hovered row, where `bg-muted` vanishes. */
        filledOnMuted:
          "border-transparent bg-background text-foreground-secondary",
        violetTint:
          "border-category-violet/40 bg-category-violet/10 text-foreground-secondary",
        skyTint:
          "border-category-sky/40 bg-category-sky/10 text-foreground-secondary",
        emeraldTint:
          "border-category-emerald/40 bg-category-emerald/10 text-foreground-secondary",
        amberTint:
          "border-category-amber/40 bg-category-amber/10 text-foreground-secondary",
        pinkTint:
          "border-category-pink/40 bg-category-pink/10 text-foreground-secondary",
        indigoTint:
          "border-category-indigo/40 bg-category-indigo/10 text-foreground-secondary",
        tealTint:
          "border-category-teal/40 bg-category-teal/10 text-foreground-secondary",
        orangeTint:
          "border-category-orange/40 bg-category-orange/10 text-foreground-secondary",
        limeTint:
          "border-category-lime/40 bg-category-lime/10 text-foreground-secondary",
        fuchsiaTint:
          "border-category-fuchsia/40 bg-category-fuchsia/10 text-foreground-secondary",
        inverted: "border-transparent bg-primary text-primary-foreground",
      },
      interactive: {
        true: "underline-dotted",
        false: "",
      },
      /** Metric values (latency, cost, timestamps) read in mono. */
      font: {
        sans: "font-sans",
        mono: "font-mono",
      },
      shouldWrap: {
        true: "h-auto leading-snug",
        false: "",
      },
    },
    defaultVariants: {
      color: "primary",
      size: "default",
      interactive: false,
      font: "sans",
    },
  },
);

type BadgeShellProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "className" | "style"
> &
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
  font,
  shouldWrap,
  ...props
}: BadgeShellProps) {
  const Component = asChild ? Slot : "span";

  return (
    <Component
      className={cn(
        "group/badge",
        badgeVariants({ color, size, interactive, font, shouldWrap }),
      )}
      {...props}
    />
  );
}

type BadgeProps = Omit<BadgeShellProps, "asChild" | "children"> & {
  text: string;
  /** Key shown muted before the value, e.g. `latency` before `0.71s`. */
  label?: string;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Link badges tint the arrow and underline the text on hover. */
  trailingIconTone?: "default" | "link";
};

export function Badge({
  color,
  text,
  label,
  title,
  interactive,
  shouldWrap,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  trailingIconTone = "default",
  ...props
}: BadgeProps) {
  return (
    <BadgeShell color={color} shouldWrap={shouldWrap} {...props}>
      {LeadingIcon && (
        <LeadingIcon
          aria-hidden
          className="icon-sm text-foreground-tertiary shrink-0"
        />
      )}
      {label && <span className="shrink-0 py-0.5">{label}:</span>}
      <span
        className={cn(
          "py-0.5",
          shouldWrap
            ? "min-w-0 break-words whitespace-normal"
            : "text-ellipsis whitespace-nowrap",
          interactive
            ? "underline-dotted overflow-clip"
            : "overflow-x-clip overflow-y-visible",
          trailingIconTone === "link" &&
            "underline-offset-2 group-hover/badge:underline",
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
