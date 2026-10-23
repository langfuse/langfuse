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
      /**
       * Neutrals are named by appearance, status colours by hue, category
       * colours by hue plus family (`Tint`, `Highlight`). Coloured fills carry
       * a same-hue hairline in light mode and none in dark mode.
       */
      color: {
        outline: "border-border bg-transparent text-foreground-secondary",
        ghost: "border-0 bg-transparent px-0 text-foreground-secondary",
        /** Translucent, so the chip stays visible on muted, hovered and selected rows. */
        filled:
          "border-transparent bg-foreground/5 text-foreground-secondary dark:bg-foreground/10",
        inverted: "border-transparent bg-primary text-primary-foreground",
        red: "border-red-100 bg-red-50 text-red-800 dark:border-transparent dark:bg-light-red/40 dark:text-dark-red/90",
        yellow:
          "border-yellow-100 bg-yellow-50 text-yellow-800 dark:border-transparent dark:bg-light-yellow/80 dark:text-dark-yellow",
        green:
          "border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-transparent dark:bg-light-green dark:text-dark-green",
        blue: "border-blue-100 bg-blue-50 text-blue-800 dark:border-transparent dark:bg-light-blue dark:text-dark-blue",
        violet:
          "border-violet-100 bg-violet-50 text-violet-800 dark:border-transparent dark:bg-light-violet dark:text-dark-violet",
        teal: "border-teal-100 bg-teal-50 text-teal-800 dark:border-transparent dark:bg-light-teal dark:text-dark-teal",
        violetTint:
          "border-category-violet/40 bg-category-violet/10 text-foreground-secondary dark:border-transparent dark:bg-category-violet/15",
        skyTint:
          "border-category-sky/40 bg-category-sky/10 text-foreground-secondary dark:border-transparent dark:bg-category-sky/15",
        emeraldTint:
          "border-category-emerald/40 bg-category-emerald/10 text-foreground-secondary dark:border-transparent dark:bg-category-emerald/15",
        amberTint:
          "border-category-amber/40 bg-category-amber/10 text-foreground-secondary dark:border-transparent dark:bg-category-amber/15",
        pinkTint:
          "border-category-pink/40 bg-category-pink/10 text-foreground-secondary dark:border-transparent dark:bg-category-pink/15",
        indigoTint:
          "border-category-indigo/40 bg-category-indigo/10 text-foreground-secondary dark:border-transparent dark:bg-category-indigo/15",
        tealTint:
          "border-category-teal/40 bg-category-teal/10 text-foreground-secondary dark:border-transparent dark:bg-category-teal/15",
        orangeTint:
          "border-category-orange/40 bg-category-orange/10 text-foreground-secondary dark:border-transparent dark:bg-category-orange/15",
        limeTint:
          "border-category-lime/40 bg-category-lime/10 text-foreground-secondary dark:border-transparent dark:bg-category-lime/15",
        fuchsiaTint:
          "border-category-fuchsia/40 bg-category-fuchsia/10 text-foreground-secondary dark:border-transparent dark:bg-category-fuchsia/15",
        /** Match the treemap tiles. */
        violetHighlight:
          "border-category-violet-highlight bg-category-violet-highlight/35 text-foreground-secondary dark:border-transparent",
        blueHighlight:
          "border-category-blue-highlight bg-category-blue-highlight/35 text-foreground-secondary dark:border-transparent",
        amberHighlight:
          "border-category-amber-highlight bg-category-amber-highlight/35 text-foreground-secondary dark:border-transparent",
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
      color: "outline",
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
  /** `warning` tints only the leading icon, e.g. a ghost "no cost" badge. */
  leadingIconTone?: "default" | "warning";
  trailingIcon?: IconComponent;
  /** Link badges tint the arrow and underline the text on hover. */
  trailingIconTone?: "default" | "link";
};

/**
 * Pick the colour by the badge's job:
 * - `ghost`: scan or follow. Header metrics and links (latency, cost, session, user).
 * - `outline` (default): read. Attributes such as environment, release, version.
 * - `filled`: data chips. Scores, tags, counts.
 * - `inverted`: one strong marker per surface, e.g. a version number next to a title.
 * - Status hues: a state or level, never decoration. `red` error, `yellow` warning,
 *   `green` success; `blue`, `violet`, `teal` mark score levels.
 * - Category `Tint` / `Highlight`: tell categories apart (topics, treemap). Text stays
 *   neutral; the hue carries the category.
 *
 * Links use `LinkBadge`.
 */
export function Badge({
  color,
  text,
  label,
  title,
  interactive,
  shouldWrap,
  leadingIcon: LeadingIcon,
  leadingIconTone = "default",
  trailingIcon: TrailingIcon,
  trailingIconTone = "default",
  ...props
}: BadgeProps) {
  const warningIcon = leadingIconTone === "warning";
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
