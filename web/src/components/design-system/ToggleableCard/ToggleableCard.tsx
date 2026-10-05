"use client";

import { type ReactNode } from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { Switch } from "@/src/components/design-system/Switch/Switch";

export function ToggleableCard({
  id,
  title,
  checked,
  disabled,
  onCheckedChange,
  actions,
  children,
}: {
  id: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const contentId = `${id}-content`;

  return (
    <CollapsiblePrimitive.Root
      open={checked}
      className="bg-card text-card-foreground rounded-lg border shadow-xs"
    >
      <div className="flex items-center gap-2 p-4">
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          aria-controls={contentId}
          aria-expanded={checked}
          onCheckedChange={onCheckedChange}
        />
        <label
          htmlFor={id}
          className="cursor-pointer text-sm leading-none font-bold peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {title}
        </label>
        {checked ? (
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <CollapsiblePrimitive.Content
        id={contentId}
        className="space-y-3 border-t p-4"
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
