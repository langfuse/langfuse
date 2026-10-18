/* eslint-disable @repo/no-style-props, @repo/no-margin-on-root-elements, @repo/component-file-structure */
"use client";

import * as React from "react";
import { DialogTitle, type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/src/components/ui/dialog";

const commandDialogSurfaceClass = "bg-popover";

const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({
  children,
  filter,
  ...props
}: DialogProps & {
  filter?: React.ComponentProps<typeof CommandPrimitive>["filter"];
}) => {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          commandDialogSurfaceClass,
          // Dark-mode depth: two near-black ambient layers.
          "top-[calc(var(--banner-offset)+clamp(4rem,20dvh,12rem))] translate-y-0 overflow-hidden p-0 shadow-2xl dark:shadow-[0_32px_96px_-28px_hsl(var(--background)/0.95),0_16px_40px_-24px_hsl(var(--background)/0.9)]",
        )}
        closeOnInteractionOutside
        overlayMode="soft"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only p-0">
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <Command
            filter={filter}
            className={cn(
              commandDialogSurfaceClass,
              "**:[[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]_svg]:icon-base [&_[cmdk-item]_svg]:text-muted-foreground [&_[cmdk-item][data-selected=true]]:text-primary **:[[cmdk-input]]:text-primary **:[[cmdk-list]]:scroll-fade-b [&_.cmdk-input-wrapper>svg]:left-4 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-item]]:py-2.5 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-normal **:[[cmdk-group]]:px-2 **:[[cmdk-input]]:h-11 **:[[cmdk-input]]:pl-8.5 **:[[cmdk-list]]:max-h-[min(24rem,calc(100dvh-var(--banner-offset)-clamp(4rem,20dvh,12rem)-4.5rem))] **:[[cmdk-list]]:scroll-py-2 **:[[cmdk-list]]:pb-1",
            )}
          >
            {children}
          </Command>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
    showBorder?: boolean;
    /** Compact panel-toolbar search: 28px, xs text, mono placeholder. */
    variant?: "default" | "toolbar";
  }
>(({ className, showBorder = true, variant = "default", ...props }, ref) => (
  <div
    className={cn(
      "relative flex items-center p-1",
      showBorder && "border-b",
      "cmdk-input-wrapper",
    )}
  >
    <Search className="icon-base absolute top-1/2 left-2 mr-2 shrink-0 -translate-y-1/2 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "placeholder:text-muted-foreground flex h-8 w-full rounded-md bg-transparent py-3 pr-6 pl-6 text-sm outline-hidden focus:ring-0 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        variant === "toolbar" && "h-7 text-xs placeholder:font-mono",
        className,
      )}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-x-hidden overflow-y-auto", className)}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "text-foreground **:[[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-bold",
      className,
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("bg-border -mx-1 h-px", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      className,
      "data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

type CommandShortcutProps = KeyboardShortcutProps & {
  className?: string;
};

const CommandShortcut = ({ className, ...props }: CommandShortcutProps) => {
  return (
    <span className={cn("ml-auto hidden md:inline-flex", className)}>
      <KeyboardShortcut {...props} />
    </span>
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
