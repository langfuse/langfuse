import { Slot } from "@radix-ui/react-slot";
import { X } from "@langfuse/icons";
import { type ComponentProps, type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";
import { DropdownIndicator } from "../../DropdownIndicator/DropdownIndicator";
import { InputControl } from "../InputControl/InputControl";

const triggerPadding = {
  // Reserves the shared 14px indicator, 6px from the border, plus a 4px gap.
  field: "py-2 pl-3 pr-6",
  compact: "pl-1.5 pr-6",
} as const;

type SelectControlProps = Omit<
  ComponentProps<typeof InputControl>,
  "contentLayout" | "trailingAction" | "children" | "focusTarget"
> & {
  children: ReactNode;
  /** `compact` matches tag inputs, whose content sits closer to the border. */
  inset?: keyof typeof triggerPadding;
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
  ...props
}: SelectControlProps) {
  return (
    <InputControl
      contentLayout="none"
      height={height}
      focusTarget="within"
      error={error}
      disabled={disabled}
      prefix={prefix}
      {...props}
    >
      <div className="relative flex w-full min-w-0 items-center">
        <Slot
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-1 text-left outline-hidden focus:ring-0",
            triggerPadding[inset],
          )}
        >
          {children}
        </Slot>
        <span
          data-select-indicator={clear ? "clear" : "caret"}
          className="pointer-events-none absolute top-1/2 right-1.5 flex size-3.5 -translate-y-1/2 items-center justify-center [&_svg]:pointer-events-none"
        >
          {clear ? (
            <button
              type="button"
              aria-label={clear.label}
              disabled={disabled || clear.disabled}
              className="focus-visible:ring-ring enabled:hover:bg-accent pointer-events-auto absolute -inset-1 flex items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed"
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
    </InputControl>
  );
}
