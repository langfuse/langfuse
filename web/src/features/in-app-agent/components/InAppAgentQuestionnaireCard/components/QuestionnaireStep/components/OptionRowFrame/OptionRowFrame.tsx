import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef } from "react";

export type OptionRowFrameProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className"
>;

/**
 * Applies the clickable option-row layout to its single child, usually the
 * `<label>` that wraps the row's radio or checkbox.
 */
export function OptionRowFrame(props: OptionRowFrameProps) {
  return (
    <Slot
      className="hover:bg-muted/50 has-focus-visible:bg-muted/50 flex cursor-pointer items-start gap-3 px-4 py-2 text-xs has-disabled:cursor-not-allowed"
      {...props}
    />
  );
}
