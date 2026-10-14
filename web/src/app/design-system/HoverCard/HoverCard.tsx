"use client";

import * as React from "react";

import { ControlledHoverCard } from "../ControlledHoverCard/ControlledHoverCard";

function HoverCard({
  onOpenChange,
  ...props
}: Omit<
  React.ComponentProps<typeof ControlledHoverCard>,
  "open" | "onOpenChange"
> & {
  onOpenChange?: React.ComponentProps<
    typeof ControlledHoverCard
  >["onOpenChange"];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <ControlledHoverCard
      {...props}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
    />
  );
}

export { HoverCard };
