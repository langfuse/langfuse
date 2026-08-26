import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const keyboardShortcutVariants = cva(
  "pointer-events-none hidden items-center justify-center gap-1 rounded-md border font-mono leading-none font-bold select-none",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground shadow-xs",
        subtle:
          "border-border bg-transparent text-muted-foreground shadow-none",
        onPrimary:
          "border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground shadow-xs",
      },
      size: {
        default: "h-5 min-w-5 px-1.5 text-[10px]",
        sm: "h-4 min-w-4 px-1 text-[9px]",
        xs: "h-3.5 min-w-3.5 px-1 text-[9px]",
      },
      display: {
        responsive: "md:inline-flex",
        groupFocus: "md:hidden md:group-focus-within:inline-flex",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      display: "responsive",
    },
  },
);

type KeyboardShortcutContent =
  | { children: React.ReactNode; keys?: never }
  | { children?: never; keys: React.ReactNode[] };

export type KeyboardShortcutProps = {
  ref?: React.Ref<HTMLElement>;
  title?: string;
} & VariantProps<typeof keyboardShortcutVariants> &
  KeyboardShortcutContent;

export function KeyboardShortcut({
  ref,
  children,
  keys,
  title,
  variant,
  size,
  display,
}: KeyboardShortcutProps) {
  return (
    <kbd
      ref={ref}
      className={keyboardShortcutVariants({ variant, size, display })}
      title={title}
    >
      {keys
        ? keys.map((key, index) => <span key={index}>{key}</span>)
        : children}
    </kbd>
  );
}
