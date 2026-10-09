import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef } from "react";

/** Bar heights mirror the design-system SearchInput: default h-8, large h-9. */
export type ComposerSize = "default" | "large";

const composerSurfaceVariants = cva("relative rounded-md border", {
  variants: {
    size: {
      default: "min-h-8 px-2 py-0.75",
      large: "min-h-9 px-2 py-1.25",
    },
    tone: {
      default: "bg-background",
      muted: "bg-muted/30",
    },
    error: {
      true: "border-destructive",
      false: "border-input",
    },
    interactive: {
      true: "focus-within:ring-1",
      false: null,
    },
    // Right gutter for the top-right control: error icon or "Ask AI" button.
    trailing: {
      none: null,
      icon: "pr-8",
      button: "pr-20",
    },
  },
  compoundVariants: [
    { interactive: true, error: false, class: "focus-within:ring-ring" },
    {
      interactive: true,
      error: true,
      class: "focus-within:ring-destructive/40",
    },
  ],
  defaultVariants: {
    size: "default",
    tone: "default",
    error: false,
    interactive: false,
    trailing: "none",
  },
});

type SlotProps = Omit<ComponentPropsWithoutRef<typeof Slot>, "className">;

type ComposerSurfaceProps = SlotProps & {
  size?: ComposerSize;
  tone?: "default" | "muted";
  error?: boolean;
  interactive?: boolean;
  trailing?: "none" | "icon" | "button";
};

/**
 * The composer bar's box, applied to one child. Shared by the editor, the
 * read-only preview that overlays it, and read-only filter displays, so they
 * render pixel-identical.
 */
export function ComposerSurface({
  size,
  tone,
  error,
  interactive,
  trailing,
  ...props
}: ComposerSurfaceProps) {
  return (
    <Slot
      className={composerSurfaceVariants({
        size,
        tone,
        error,
        interactive,
        trailing,
      })}
      {...props}
    />
  );
}

/** Query text metrics; leading-6 matches the pill height so the caret aligns. */
export function ComposerText(props: SlotProps) {
  return (
    <Slot
      className="min-h-6 font-mono text-xs leading-6 break-words whitespace-pre-wrap"
      {...props}
    />
  );
}
