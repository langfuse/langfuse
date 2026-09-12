/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";

import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { cn } from "@/src/utils/tailwind";
import { stopScrollPropagation, useLayerContainer } from "../../ui/layer";

type MultiSelectOption<V> = {
  value: V;
  label: string;
  secondaryLabel?: string;
};

type MultiSelectInputProps<V> = {
  value: V[];
  options: MultiSelectOption<V>[];
  onValueChange: (newValue: V[]) => void;
  placeholder: string;
  selectedLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
} & Pick<
  React.ComponentPropsWithoutRef<"button">,
  "id" | "aria-describedby" | "aria-invalid"
>;

function MultiSelectInputInner<V extends string>(
  {
    value,
    options,
    onValueChange,
    placeholder,
    selectedLabel,
    searchPlaceholder,
    emptyMessage,
    ...triggerProps
  }: MultiSelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const { register, recompute, top, bottom } =
    useScrollGradients<HTMLDivElement>(true);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-foreground-tertiary focus:ring-ring disabled:bg-muted/50 flex h-8 w-full items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            value.length === 0 && "text-muted-foreground",
          )}
          {...triggerProps}
        >
          <span
            className="min-w-0 flex-1 truncate text-left"
            title={value.length > 0 ? selectedLabel : undefined}
          >
            {value.length > 0 ? selectedLabel : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onWheel={stopScrollPropagation()}
          onTouchMove={stopScrollPropagation()}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative w-(--radix-popover-trigger-width) min-w-32 overflow-hidden rounded-md border shadow-md outline-hidden"
        >
          <CommandPrimitive className="bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md">
            <div className="flex items-center border-b px-2">
              <Search className="size-4 shrink-0 opacity-50" />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                className="placeholder:text-foreground-tertiary flex h-8 w-full rounded border-transparent bg-transparent px-2 py-3 text-sm outline-hidden focus:border-0 focus:border-none focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandPrimitive.Empty className="py-6 text-center text-sm">
              {emptyMessage}
            </CommandPrimitive.Empty>
            <CommandPrimitive.List
              id={listId}
              ref={register}
              onScroll={recompute}
              className={cn(
                "before:from-popover after:from-popover max-h-96 overflow-auto p-1.5 before:pointer-events-none before:sticky before:-top-1.5 before:z-2 before:-mx-1.5 before:-mb-6 before:block before:h-6 before:bg-linear-to-b before:to-transparent before:content-[''] after:pointer-events-none after:sticky after:-bottom-1.5 after:z-2 after:-mx-1.5 after:-mt-6 after:block after:h-6 after:bg-linear-to-t after:to-transparent after:content-['']",
                top ? "before:opacity-100" : "before:opacity-0",
                bottom ? "after:opacity-100" : "after:opacity-0",
              )}
            >
              <CommandPrimitive.Group className="text-foreground overflow-hidden">
                {options.map((option) => {
                  const isSelected = value.includes(option.value);

                  return (
                    <CommandPrimitive.Item
                      value={option.value}
                      keywords={[option.label]}
                      key={option.value}
                      className="aria-selected:bg-accent aria-selected:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-1.5 py-1.5 text-sm outline-hidden select-none"
                      onSelect={() => {
                        if (isSelected) {
                          onValueChange(
                            value.filter(
                              (selectedValue) => selectedValue !== option.value,
                            ),
                          );
                          return;
                        }

                        onValueChange([...value, option.value]);
                      }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={option.label}
                      >
                        {option.label}
                        {option.secondaryLabel && (
                          <span className="text-muted-foreground ml-1">
                            {option.secondaryLabel}
                          </span>
                        )}
                      </span>
                      <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center">
                        <Check
                          className={cn(
                            "size-4",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </span>
                    </CommandPrimitive.Item>
                  );
                })}
              </CommandPrimitive.Group>
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

type MultiSelectInputComponent = {
  <V extends string>(
    props: MultiSelectInputProps<V> & React.RefAttributes<HTMLButtonElement>,
  ): React.ReactElement | null;

  displayName?: string;
};

export const MultiSelectInput = React.forwardRef(
  MultiSelectInputInner,
) as MultiSelectInputComponent;

MultiSelectInput.displayName = "MultiSelectInput";
