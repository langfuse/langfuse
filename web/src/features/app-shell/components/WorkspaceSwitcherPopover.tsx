import { type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { WorkspaceSwitcherMenu } from "@/src/features/app-shell/components/WorkspaceSwitcherMenu";

/**
 * Opens the workspace switcher anchored to whatever trigger the caller
 * renders through `Trigger asChild`. Open state is owned by the caller, so the
 * sidebar can open its switcher from a keyboard shortcut.
 */
export function WorkspaceSwitcherPopover({
  isOpen,
  onOpenChange,
  onCloseAutoFocus,
  side,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  side: "bottom" | "right";
  children: (control: { Trigger: typeof PopoverTrigger }) => ReactNode;
}) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      {children({ Trigger: PopoverTrigger })}
      {/* Every opening owns a fresh focus scope, including rapid close/reopen. */}
      {isOpen && (
        <PopoverContent
          onCloseAutoFocus={onCloseAutoFocus}
          side={side}
          align="start"
          sideOffset={6}
          className="ph-no-capture w-[min(22rem,calc(100vw-1rem))] overflow-hidden p-0"
        >
          <WorkspaceSwitcherMenu onDone={() => onOpenChange(false)} />
        </PopoverContent>
      )}
    </Popover>
  );
}
