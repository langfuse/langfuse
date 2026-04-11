"use client";

import type { ComponentProps } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@/src/utils/tailwind";

const Select = SelectPrimitive.Root;

function getTriggerSizeClass(size: "default" | "sm") {
  return size === "sm" ? "h-7 px-2 text-sm" : "h-8 px-2.5 text-sm";
}

function getTriggerVariantClass(variant: "default" | "inline") {
  return variant === "inline"
    ? "h-auto border-0 bg-muted/45 px-2 py-1 text-[0.8125rem] font-medium shadow-none data-[popup-open]:border-transparent data-[popup-open]:ring-0"
    : "border-input bg-background text-foreground shadow-xs data-[popup-open]:border-ring data-[popup-open]:ring-ring/30 data-[popup-open]:ring-2";
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group className={cn(className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn(
        "data-[placeholder]:text-muted-foreground truncate",
        className,
      )}
      {...props}
    />
  );
}

function SelectTrigger({
  children,
  className,
  size = "default",
  variant = "default",
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
  variant?: "default" | "inline";
}) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/30 inline-flex w-fit min-w-0 items-center justify-between gap-2 rounded-md outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        getTriggerSizeClass(size),
        getTriggerVariantClass(variant),
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDown className="text-muted-foreground size-3.5" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  align = "center",
  alignItemWithTrigger = true,
  alignOffset = 0,
  children,
  className,
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignItemWithTrigger" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        className="outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            "border-border bg-popover text-popover-foreground min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-md border p-1 shadow-md",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="max-h-(--available-height) overflow-y-auto py-1">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn(
        "text-muted-foreground px-2 py-1 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  children,
  className,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      className={cn(
        "text-muted-foreground flex h-6 items-center justify-center",
        className,
      )}
      {...props}
    >
      <ChevronUp className="size-3.5" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      className={cn(
        "text-muted-foreground flex h-6 items-center justify-center",
        className,
      )}
      {...props}
    >
      <ChevronDown className="size-3.5" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
