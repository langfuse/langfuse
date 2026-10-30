import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { type ComponentPropsWithoutRef } from "react";

const inputControlVariants = cva(
  "bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring disabled:bg-muted/50 h-8 w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      contentLayout: {
        none: null,
        text: "min-w-14 px-3 py-2",
        spread: "flex min-w-0 items-center justify-between gap-1 px-3 py-2",
        prefixed:
          "flex min-w-0 cursor-text items-center overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      },
      trailingAction: {
        true: "pr-10",
        false: null,
      },
      error: {
        true: "border-destructive focus-visible:ring-destructive/40 focus-visible:ring-offset-0 [&_svg]:text-destructive",
        false: "border-input",
      },
      disabled: {
        true: "bg-muted/50 cursor-not-allowed opacity-50",
        false: null,
      },
    },
    defaultVariants: {
      error: false,
    },
    compoundVariants: [
      {
        contentLayout: "prefixed",
        error: true,
        className:
          "focus-within:ring-destructive/40 focus-within:ring-offset-0",
      },
    ],
  },
);

type InputControlProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className"
> & {
  contentLayout: "none" | "text" | "spread";
  error?: boolean;
  disabled?: boolean;
  prefix?: string;
  addon?: string;
  trailingAction?: {
    label: string;
    icon: IconComponent;
    disabled?: boolean;
    pressed?: boolean;
    onClick: () => void;
  };
};

/**
 * Owns shared form-control styling and optional prefix, addon, and action layout.
 * Specialized inputs own the interactive child's behavior.
 */
export function InputControl({
  contentLayout,
  error,
  disabled,
  trailingAction,
  prefix,
  addon,
  ...props
}: InputControlProps) {
  const hasPrefix = prefix !== undefined || addon !== undefined;
  const controlClassName = inputControlVariants({
    contentLayout: hasPrefix ? "prefixed" : contentLayout,
    error,
    disabled,
    trailingAction: Boolean(trailingAction),
  });
  const input = (
    <Slot
      className={
        hasPrefix
          ? "placeholder:text-muted-foreground h-full min-w-0 flex-1 border-0 bg-transparent py-0 pr-3 pl-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed"
          : controlClassName
      }
      {...props}
    />
  );
  const control = hasPrefix ? (
    <div
      className={controlClassName}
      onMouseDown={(event) => {
        const input = event.currentTarget.querySelector("input");
        if (event.target === input) return;
        event.preventDefault();
        input?.focus();
      }}
    >
      {addon && (
        <span className="bg-muted text-muted-foreground border-input flex h-full shrink-0 items-center border-r px-2.5 font-mono text-xs">
          {addon}
        </span>
      )}
      <span className="text-foreground-secondary shrink-0 pr-0.5 pl-3">
        {prefix}
      </span>
      {input}
    </div>
  ) : (
    input
  );

  if (!trailingAction) return control;

  const TrailingActionIcon = trailingAction.icon;

  return (
    <div className="relative">
      {control}
      <button
        type="button"
        aria-label={trailingAction.label}
        aria-pressed={trailingAction.pressed}
        disabled={trailingAction.disabled}
        // Keep the action out of the tab order so Tab moves between inputs.
        tabIndex={-1}
        className="absolute top-1/2 right-3 flex -translate-y-1/2 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
        onClick={trailingAction.onClick}
      >
        <TrailingActionIcon
          aria-hidden="true"
          size="base"
          color={error ? "destructive" : "muted"}
        />
      </button>
    </div>
  );
}
