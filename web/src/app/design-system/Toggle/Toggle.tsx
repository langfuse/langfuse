"use client";

import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";

type ToggleProps = Pick<
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
  "children" | "onClick" | "onMouseEnter" | "onMouseLeave" | "pressed"
>;

export function Toggle(props: ToggleProps) {
  return (
    <TogglePrimitive.Root
      className="text-muted-foreground/50 ring-offset-background hover:bg-background hover:text-primary-accent focus-visible:ring-ring data-[state=on]:text-primary-accent inline-flex h-8 items-center justify-center rounded-md bg-transparent p-1 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      {...props}
    />
  );
}
