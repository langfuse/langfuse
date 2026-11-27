import { useState } from "react";
import {
  ControlledOrganizationDropdownMenu,
  type OrganizationMenuOptions,
} from "./ControlledOrganizationDropdownMenu";

/** Organization menu whose open state belongs to this mounted control. */
export function OrganizationDropdownMenu(props: OrganizationMenuOptions) {
  const [open, setOpen] = useState(false);
  return (
    <ControlledOrganizationDropdownMenu
      {...props}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
