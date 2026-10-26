/* eslint-disable @repo/component-file-structure */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { type ComponentPropsWithoutRef, type ElementType } from "react";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center rounded-sm border font-mono text-xs leading-none font-normal",
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
       * Neutrals are named by appearance, status colours by state, category
       * colours by hue plus `Tint`. Every coloured fill carries a same-hue
       * hairline tuned to error's border-to-fill lightness gap, in both modes.
       */
      color: {
        outline: "border-border bg-transparent text-foreground-secondary",
        ghost: "border-0 bg-transparent px-0 text-foreground-secondary",
        /** Translucent, so the chip stays visible on muted, hovered and selected rows. */
        filled:
          "border-transparent bg-foreground/5 text-foreground-secondary dark:bg-foreground/10",
        inverted: "border-transparent bg-primary text-primary-foreground",
        error:
          "border-red-100 bg-red-50 text-red-800 dark:border-dark-red/5 dark:bg-light-red/40 dark:text-dark-red/90",
        warning:
          "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-dark-yellow/6 dark:bg-light-yellow/80 dark:text-dark-yellow",
        success:
          "border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-dark-green/6 dark:bg-light-green dark:text-dark-green",
        info: "border-blue-100 bg-blue-50 text-blue-800 dark:border-dark-blue/8 dark:bg-light-blue dark:text-dark-blue",
        violetTint:
          "border-category-violet/8 bg-category-violet/10 text-foreground-secondary dark:border-category-violet/11 dark:bg-category-violet/15",
        skyTint:
          "border-category-sky/8 bg-category-sky/10 text-foreground-secondary dark:border-category-sky/9 dark:bg-category-sky/15",
        emeraldTint:
          "border-category-emerald/9 bg-category-emerald/10 text-foreground-secondary dark:border-category-emerald/9 dark:bg-category-emerald/15",
        amberTint:
          "border-category-amber/10 bg-category-amber/10 text-foreground-secondary dark:border-category-amber/8 dark:bg-category-amber/15",
        pinkTint:
          "border-category-pink/8 bg-category-pink/10 text-foreground-secondary dark:border-category-pink/9 dark:bg-category-pink/15",
        indigoTint:
          "border-category-indigo/7 bg-category-indigo/10 text-foreground-secondary dark:border-category-indigo/11 dark:bg-category-indigo/15",
        tealTint:
          "border-category-teal/9 bg-category-teal/10 text-foreground-secondary dark:border-category-teal/9 dark:bg-category-teal/15",
        orangeTint:
          "border-category-orange/8 bg-category-orange/10 text-foreground-secondary dark:border-category-orange/10 dark:bg-category-orange/15",
        limeTint:
          "border-category-lime/10 bg-category-lime/10 text-foreground-secondary dark:border-category-lime/8 dark:bg-category-lime/15",
        fuchsiaTint:
          "border-category-fuchsia/7 bg-category-fuchsia/10 text-foreground-secondary dark:border-category-fuchsia/11 dark:bg-category-fuchsia/15",
      },
      interactive: {
        true: "underline-dotted",
        false: "",
      },
      dismissible: {
        true: "cursor-pointer transition-opacity hover:opacity-80 ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        false: "",
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
          shouldWrap,
          dismissible: onDismiss != null,
        }),
      )}
    />
  );
}

type BadgeColor = NonNullable<BadgeShellProps["color"]>;

type BadgeProps = Omit<BadgeShellProps, "asChild" | "children" | "color"> & {
  text: string;
  /** Key shown muted before the value, e.g. `latency` before `0.71s`. */
  label?: string;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  /** Link badges tint the arrow and underline the text on hover. */
  trailingIconTone?: "default" | "link";
} & (
    | {
        color: "ghost";
        /** `warning` tints only the leading icon, e.g. a "no cost" badge. */
        leadingIconTone?: "default" | "warning";
      }
    | { color?: Exclude<BadgeColor, "ghost">; leadingIconTone?: never }
  );

/**
 * Pick the colour by the badge's job:
 * - `ghost`: scan or follow. Header metrics and links (latency, cost, session, user).
 * - `outline` (default): read. Attributes such as environment, release, version.
 * - `filled`: data chips. Scores, tags, counts.
 * - `inverted`: one strong marker per surface, e.g. a version number next to a title.
 * - `error`, `warning`, `success`, `info`: a state, never decoration.
 * - Category `Tint`: tell categories apart (score levels, topics, widget types).
 *   Text stays neutral; the hue carries the category.
 *
 * Links use `LinkBadge`. Full guidance with examples: `Badge.mdx` (Storybook "Guidance").
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
