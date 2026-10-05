"use client";

import { type ReactNode } from "react";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Card } from "@/src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
} from "@/src/components/ui/collapsible";

export function ToggleableCard({
  id,
  title,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  id: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const contentId = `${id}-content`;

  return (
    <Collapsible open={checked}>
      <Card>
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
            className="cursor-pointer text-sm leading-none font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {title}
          </label>
        </div>
        <CollapsibleContent id={contentId} className="space-y-3 border-t p-4">
          {children}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
