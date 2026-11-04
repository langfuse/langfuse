import { Slot } from "@radix-ui/react-slot";
import { type ComponentPropsWithoutRef } from "react";

type ComposerTextProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className"
>;

/** Query text metrics; leading-6 matches the pill height so the caret aligns. */
export function ComposerText(props: ComposerTextProps) {
  return (
    <Slot
      className="min-h-6 font-mono text-xs leading-6 break-words whitespace-pre-wrap"
      {...props}
    />
  );
}
