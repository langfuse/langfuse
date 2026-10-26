/* eslint-disable @repo/component-file-structure */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { type ComponentPropsWithoutRef, type ElementType } from "react";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center rounded-sm border text-xs leading-none font-normal",
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
        /** `ghost` with the leading icon in the warning colour; the text stays muted. */
        "ghost-warning":
          "border-0 bg-transparent px-0 text-foreground-secondary",
        filled: "border-transparent bg-muted text-foreground-secondary",
        /** `filled` for a chip on a muted or accent surface, e.g. a selected or hovered row, where `bg-muted` vanishes. */
        filledOnMuted:
          "border-transparent bg-background text-foreground-secondary",
        /** Category highlight tints, as used by treemap tiles. */
        violetHighlight:
          "border-transparent bg-category-violet-highlight/35 text-foreground-secondary",
        blueHighlight:
          "border-transparent bg-category-blue-highlight/35 text-foreground-secondary",
        amberHighlight:
          "border-transparent bg-category-amber-highlight/35 text-foreground-secondary",
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
      dismissible: {
        true: "cursor-pointer transition-opacity hover:opacity-80 ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
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
  Omit<VariantProps<typeof badgeVariants>, "dismissible"> & {
    asChild?: boolean;
    /** When set, the shell renders as a `<button type="button">` and calls this on click. */
    onDismiss?: () => void;
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
  onDismiss,
  ...props
}: BadgeShellProps) {
  const Component = ((): ElementType => {
    if (asChild) return Slot;
    if (onDismiss != null) return "button";
    return "span";
  })();

  return (
    <Component
      {...props}
      {...(onDismiss != null && { type: "button", onClick: onDismiss })}
      className={cn(
        "group/badge",
        badgeVariants({
          color,
          size,
          interactive,
          font,
          shouldWrap,
          dismissible: onDismiss != null,
        }),
      )}
    />
  );
}

type BadgeProps = Omit<BadgeShellProps, "asChild" | "children"> & {
  text: string;
  /** Key shown muted before the value, e.g. `latency` before `0.71s`. */
  label?: string;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
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
  const warningIcon = color === "ghost-warning";
  return (
    <BadgeShell color={color} shouldWrap={shouldWrap} {...props}>
      {LeadingIcon && (
        <LeadingIcon
          aria-hidden
          size="sm"
          color={warningIcon ? "inherit" : "tertiary"}
          __rawClassName={warningIcon ? "text-dark-yellow" : undefined}
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
          size="sm"
          color="tertiary"
          __rawClassName={trailingIconTone === "link" ? "-ml-0.5" : undefined}
        />
      )}
    </BadgeShell>
  );
}
