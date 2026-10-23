import { PopoverContent } from "@/src/components/ui/popover";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

type MobilePageActionsContentProps = {
  children: ReactNode;
  onCloseAutoFocus: NonNullable<
    ComponentPropsWithoutRef<typeof PopoverContent>["onCloseAutoFocus"]
  >;
};

/**
 * Responsive content surface for the compact page header's overflow actions.
 * It keeps mixed page controls usable at phone widths while individual pages
 * remain responsible for giving their actions meaningful labels and grouping.
 */
export function MobilePageActionsContent({
  children,
  onCloseAutoFocus,
}: MobilePageActionsContentProps) {
  return (
    <PopoverContent
      align="end"
      collisionPadding={12}
      className="w-[calc(100vw-1.5rem)] max-w-sm p-2"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="flex flex-col items-stretch gap-2">{children}</div>
    </PopoverContent>
  );
}
