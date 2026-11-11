"use client";

import { type ComponentProps, useState } from "react";
import { ControlledDropdownMenu } from "../ControlledDropdownMenu/ControlledDropdownMenu";

export type { DropdownMenuItemDefinition } from "../ControlledDropdownMenu/ControlledDropdownMenu";

function DropdownMenu(
  props: Omit<
    ComponentProps<typeof ControlledDropdownMenu>,
    "open" | "onOpenChange"
  >,
) {
  return (
    <DropdownMenuState
      key={props.disabled ? "disabled" : "enabled"}
      {...props}
    />
  );
}

function DropdownMenuState(props: ComponentProps<typeof DropdownMenu>) {
  const [open, onOpenChange] = useState(false);
  return (
    <ControlledDropdownMenu
      {...props}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

export { DropdownMenu };
