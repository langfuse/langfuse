import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/src/utils/tailwind";

const inputContentVariants = cva("", {
  variants: {
    contentLayout: {
      none: null,
      text: "min-w-14 px-3 py-2",
      spread: "flex min-w-0 items-center justify-between gap-1 px-3 py-2",
    },
  },
});

const inputSlotVariants = cva(
  "placeholder:text-muted-foreground text-sm disabled:cursor-not-allowed",
  {
    variants: {
      prefixed: {
        true: "h-full min-w-0 flex-1 border-0 bg-transparent py-0 shadow-none outline-hidden focus:ring-0",
        false: null,
      },
    },
  },
);

const inputControlVariants = cva(
  "bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring disabled:bg-muted/50 w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      height: {
        fixed: "h-8",
        auto: "h-auto",
      },
      focusTarget: {
        self: null,
        within:
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      },
      prefixed: {
        true: "flex min-w-0 items-center overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        false: null,
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
      height: "fixed",
      focusTarget: "self",
    },
    compoundVariants: [
      {
        prefixed: true,
        error: true,
        className:
          "focus-within:ring-destructive/40 focus-within:ring-offset-0",
      },
      {
        focusTarget: "within",
        error: true,
        className:
          "focus-within:ring-destructive/40 focus-within:ring-offset-0",
      },
    ],
  },
);

type InputControlProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className" | "prefix"
> &
  Pick<VariantProps<typeof inputControlVariants>, "height" | "focusTarget"> & {
    contentLayout: "none" | "text" | "spread";
    error?: boolean;
    disabled?: boolean;
    prefix?:
      | { label: string; icon?: IconComponent }
      | { label?: never; icon: IconComponent };
    trailingAction?: {
      label: string;
      icon: IconComponent;
      disabled?: boolean;
      pressed?: boolean;
      onClick: () => void;
    };
  };

/**
 * Owns shared form-control styling and optional prefix and action layout.
 * Specialized inputs own the interactive child's behavior.
 */
export function InputControl({
  contentLayout,
  height,
  focusTarget,
  error,
  disabled,
  trailingAction,
  prefix,
  ...props
}: InputControlProps) {
  const controlClassName = inputControlVariants({
    height,
    focusTarget,
    prefixed: prefix !== undefined,
    error,
    disabled,
    trailingAction: Boolean(trailingAction),
  });
  const PrefixIcon = prefix?.icon;
  const slotClassName = cn(
    inputContentVariants({ contentLayout }),
    inputSlotVariants({ prefixed: prefix !== undefined }),
    !prefix && controlClassName,
  );

  if (!prefix && !trailingAction) {
    return <Slot className={slotClassName} {...props} />;
  }

  const TrailingActionIcon = trailingAction?.icon;

  return (
    <div
      className={cn("relative", prefix && controlClassName)}
      onMouseDown={(event) => {
        if (!prefix) return;
        const input = event.currentTarget.querySelector("input");
        if (event.target === input) return;
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        if (!input) return;
        event.preventDefault();
        input.focus();
      }}
    >
      {prefix && (
        <span className="bg-muted text-muted-foreground border-input flex h-full shrink-0 items-center gap-1.5 border-r px-2.5 font-mono text-xs">
          {PrefixIcon && (
            <PrefixIcon aria-hidden="true" size="base" color="muted" />
          )}
          {prefix.label}
        </span>
      )}
      <Slot className={slotClassName} {...props} />
      {trailingAction && TrailingActionIcon && (
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
      )}
    </div>
  );
}
