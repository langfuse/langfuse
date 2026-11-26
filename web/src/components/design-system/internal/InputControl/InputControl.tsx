import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { type ComponentPropsWithoutRef, type Ref } from "react";
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
      segmented: {
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
      focused: {
        true: "ring-ring ring-2 ring-offset-2",
        false: null,
      },
      segmented: {
        true: "flex min-w-0 items-center overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
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
        segmented: true,
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
      {
        focused: true,
        error: true,
        className: "ring-destructive/40 ring-offset-0",
      },
    ],
  },
);

type InputControlProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className" | "prefix"
> &
  Pick<
    VariantProps<typeof inputControlVariants>,
    "height" | "focusTarget" | "focused"
  > & {
    contentLayout: "none" | "text" | "spread";
    ref?: Ref<HTMLDivElement>;
    error?: boolean;
    disabled?: boolean;
    prefix?:
      | { label: string; icon?: IconComponent }
      | { label?: never; icon: IconComponent };
    trailingAction?: {
      label: string;
      icon: IconComponent;
      appearance?: "inline" | "segmented";
      disabled?: boolean;
      pressed?: boolean;
      tabIndex?: number;
      onClick: () => void;
    };
  };

export function InputControl({
  contentLayout,
  height,
  focusTarget,
  focused,
  error,
  disabled,
  trailingAction,
  prefix,
  ref,
  ...props
}: InputControlProps) {
  const segmented = prefix !== undefined || trailingAction !== undefined;
  const controlClassName = inputControlVariants({
    height,
    focusTarget,
    focused,
    segmented,
    error,
    disabled,
  });
  const PrefixIcon = prefix?.icon;
  const slotClassName = cn(
    inputContentVariants({ contentLayout }),
    inputSlotVariants({ segmented }),
    !segmented && controlClassName,
  );

  if (!segmented) {
    return <Slot ref={ref} className={slotClassName} {...props} />;
  }

  const TrailingActionIcon = trailingAction?.icon;
  return (
    <div
      ref={ref}
      className={cn("relative", controlClassName)}
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
          disabled={disabled || trailingAction.disabled}
          tabIndex={trailingAction.tabIndex}
          className={cn(
            "focus-visible:ring-ring flex h-full shrink-0 cursor-pointer items-center justify-center px-2.5 focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset disabled:cursor-not-allowed",
            trailingAction.appearance === "inline"
              ? "rounded-sm enabled:hover:bg-accent"
              : "bg-muted border-input border-l enabled:hover:bg-accent",
          )}
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
