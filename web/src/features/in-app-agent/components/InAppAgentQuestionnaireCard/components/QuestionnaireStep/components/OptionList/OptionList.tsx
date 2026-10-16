import { Slot } from "@radix-ui/react-slot";
import type { ReactElement } from "react";

export type OptionListProps = {
  children: ReactElement;
};

/** Applies the divided option-list layout to its single child element. */
export function OptionList({ children }: OptionListProps) {
  return (
    <Slot className="divide-border border-border divide-y border-b">
      {children}
    </Slot>
  );
}
