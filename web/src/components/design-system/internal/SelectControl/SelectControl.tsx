import { Slot } from "@radix-ui/react-slot";
import { X, type IconComponent } from "@langfuse/icons";
import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";
import { DropdownIndicator } from "../../DropdownIndicator/DropdownIndicator";
import { inputControlVariants } from "../InputControl/InputControl";

const indicatorPosition = {
  field: "right-3",
  compact: "right-1.5",
} as const;

const triggerPadding = {
  // Reserves the caret's 14px box plus a 4px gap inside the field padding,
  // so the label ends where it did when the caret was in the row.
  field: "py-2 pl-3 pr-7.5",
  compact: "pl-1.5 pr-6",
} as const;

type SelectControlProps = {
  children: ReactNode;
  error?: boolean;
  disabled?: boolean;
  height?: "fixed" | "auto";
  /** `compact` matches tag inputs, whose content sits closer to the border. */
  inset?: keyof typeof indicatorPosition;
  prefix?:
    | { label: string; icon?: IconComponent }
    | { label?: never; icon: IconComponent };
  /**
   * Replaces the caret. Pass this only when a value is set and clearing is
   * allowed; the caret and the clear button never render together.
   */
  clear?: {
    label: string;
    onClear: () => void;
    disabled?: boolean;
  };
};

/**
 * Field chrome for select-like inputs. The trailing slot is either the caret
 * or the clear button, in the same box, so swapping them does not move the label.
 */
export function SelectControl({
  children,
  error,
  disabled,
  height = "fixed",
  inset = "field",
  prefix,
  clear,
}: SelectControlProps) {
  const PrefixIcon = prefix?.icon;

  return (
    <div
      className={cn(
        "relative",
        inputControlVariants({
          height,
          focusTarget: "within",
          segmented: true,
          error,
          disabled,
        }),
      )}
    >
      {prefix && (
        <span className="bg-muted text-muted-foreground border-input flex h-full shrink-0 items-center gap-1.5 border-r px-2.5 font-mono text-xs">
          {PrefixIcon && (
            <PrefixIcon aria-hidden="true" size="base" color="muted" />
          )}
          {prefix.label}
        </span>
      )}
      <Slot
        className={cn(
          "placeholder:text-muted-foreground flex h-full min-w-0 flex-1 items-center gap-1 text-left text-sm outline-hidden focus:ring-0 disabled:cursor-not-allowed",
          triggerPadding[inset],
        )}
      >
        {children}
      </Slot>
      <span
        data-select-indicator={clear ? "clear" : "caret"}
        className={cn(
          "pointer-events-none absolute top-1/2 flex size-3.5 -translate-y-1/2 items-center justify-center",
          indicatorPosition[inset],
        )}
      >
        {clear ? (
          <button
            type="button"
            aria-label={clear.label}
            disabled={disabled || clear.disabled}
            className="focus-visible:ring-ring pointer-events-auto absolute -inset-1 flex items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden enabled:hover:bg-accent disabled:cursor-not-allowed"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              clear.onClear();
            }}
          >
            <X
              aria-hidden="true"
              size="base"
              color={error ? "destructive" : "tertiary"}
            />
          </button>
        ) : (
          <DropdownIndicator color={error ? "destructive" : "tertiary"} />
        )}
      </span>
    </div>
  );
}
