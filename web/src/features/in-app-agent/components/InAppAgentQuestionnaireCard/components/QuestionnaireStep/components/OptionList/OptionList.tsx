import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef } from "react";

export type OptionListProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className"
>;

/** Applies the divided option-list layout to its single child element. */
export function OptionList(props: OptionListProps) {
  return (
    <Slot
      className="divide-border border-border divide-y border-b"
      {...props}
    />
  );
}
