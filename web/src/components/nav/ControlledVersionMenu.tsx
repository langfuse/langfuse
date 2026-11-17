import { useRef, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { VersionMenuItems } from "@/src/components/nav/VersionMenuItems";
import {
  describeVersionState,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";

/**
 * Release, plan, and resource links behind the version badge. The caller
 * renders the badge through `Trigger asChild` and spreads `triggerProps` on it.
 */
export function ControlledVersionMenu({
  state,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  state: SidebarVersionState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  children: (control: {
    Trigger: typeof DropdownMenuTrigger;
    triggerProps: { onPointerDown: () => void; onKeyDown: () => void };
  }) => ReactNode;
}) {
  const details = describeVersionState(state);

  // Radix returns focus to the trigger when the menu closes, and the browser
  // treats that programmatic focus as `:focus-visible`, so the Button's
  // `focus-visible:ring-2` ring is left showing on the badge after a
  // mouse-driven open/close. Keyboard users must keep that ring, so the focus
  // restore is suppressed only for an interaction that never used the keyboard.
  //
  // `pointerOnly` therefore has to be cleared by a key press anywhere in the
  // interaction, not only on the trigger: the menu is portalled, so once it is
  // open every key event lands on the content instead. A mouse-opened menu
  // closed with Escape or Enter is a keyboard interaction and must get focus
  // back on the trigger.
  const pointerOnly = useRef(false);
  const noteKeyboardUse = () => {
    pointerOnly.current = false;
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {children({
        Trigger: DropdownMenuTrigger,
        triggerProps: {
          onPointerDown: () => {
            pointerOnly.current = true;
          },
          onKeyDown: noteKeyboardUse,
        },
      })}
      <DropdownMenuContent
        onClick={(e) => e.stopPropagation()}
        // Both hooks are needed: Radix's DismissableLayer handles Escape before
        // it reaches the content's own onKeyDown, while onKeyDown covers the
        // arrow/Enter/typeahead keys used to pick an item.
        onKeyDown={noteKeyboardUse}
        onEscapeKeyDown={noteKeyboardUse}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus(event);
          if (!pointerOnly.current) return;
          pointerOnly.current = false;
          event.preventDefault();
        }}
      >
        <VersionMenuItems state={state} details={details} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
