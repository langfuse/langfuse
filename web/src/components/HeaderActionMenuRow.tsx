import * as React from "react";

import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type HeaderActionMenuRowProps = Omit<
  ButtonProps,
  "variant" | "size" | "className" | "children" | "title"
> & {
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "default" | "destructive";
  disabledReason?: string;
};

/** Full-width labeled row for the mobile header overflow menu. */
export const HeaderActionMenuRow = React.forwardRef<
  HTMLButtonElement,
  HeaderActionMenuRowProps
>(function HeaderActionMenuRow(
  { label, icon, badge, variant = "default", disabledReason, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 font-normal",
        variant === "destructive" && "text-destructive hover:text-destructive",
      )}
      title={disabledReason}
      {...props}
    >
      {icon}
      {label}
      {badge}
    </Button>
  );
});

type MenuItem = Extract<DropdownMenuItemDefinition, { type: "item" }>;

const isMenuItem = (item: DropdownMenuItemDefinition): item is MenuItem =>
  item.type === "item";

/** Renders the clickable items of a dropdown definition as menu rows. */
export function HeaderActionMenuRows({
  items,
}: {
  items: DropdownMenuItemDefinition[];
}) {
  return (
    <>
      {items.filter(isMenuItem).map((item) => {
        const Icon = item.icon;
        return (
          <HeaderActionMenuRow
            key={item.id}
            label={item.title}
            icon={Icon && <Icon className="h-4 w-4" />}
            variant={item.variant}
            disabled={item.disabled !== undefined}
            disabledReason={item.disabled?.reason}
            onClick={item.onClick}
          />
        );
      })}
    </>
  );
}
