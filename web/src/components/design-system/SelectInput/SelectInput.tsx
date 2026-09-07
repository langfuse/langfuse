/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

import { assertUnreachable } from "@langfuse/shared";
import { useCallback } from "react";
import { useLayerContainer } from "../../ui/layer";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

type SelectOption<V> =
  | {
      value: V;
      label: string;
      disabled?: false;
      disabledReason?: never;
    }
  | {
      value: V;
      label: string;
      disabled: true;
      disabledReason: string;
    };

type SelectGroup<V> = {
  type: "group";
  id: string;
  label: string;
  options: SelectOption<V>[];
};

type SelectInputNode<V> = SelectOption<V> | SelectGroup<V>;

type SelectInputProps<V> = {
  value: V;
  options: SelectInputNode<V>[];
  onValueChange: (newValue: V) => void;
  placeholder: string;
} & Pick<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "id" | "aria-describedby" | "aria-invalid"
>;

function isSelectGroup<V>(node: SelectInputNode<V>): node is SelectGroup<V> {
  return "type" in node && node.type === "group";
}

function SelectInputInner<V extends string>(
  {
    value,
    options,
    onValueChange,
    placeholder,
    ...triggerProps
  }: SelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const { register, recompute, top, bottom } =
    useScrollGradients<React.ComponentRef<typeof SelectPrimitive.Viewport>>(
      true,
    );
  const selectedOption = options
    .flatMap((node) => (isSelectGroup(node) ? node.options : [node]))
    .find((option) => option.value === value);
  const renderNode = useCallback(
    (
      node: SelectInputNode<V>,
      hasPreviousGroup: boolean,
    ): React.ReactElement => {
      if (isSelectGroup(node)) {
        return (
          <React.Fragment key={node.id}>
            {hasPreviousGroup && (
              <SelectPrimitive.Separator className="bg-border my-2 h-px" />
            )}
            <SelectPrimitive.Group>
              <SelectPrimitive.Label className="text-muted-foreground px-1 py-1.5 text-xs font-bold">
                {node.label}
              </SelectPrimitive.Label>
              {node.options.map((option) => renderNode(option, false))}
            </SelectPrimitive.Group>
          </React.Fragment>
        );
      }

      if ("value" in node) {
        const option = (
          <SelectPrimitive.SelectItem
            key={node.value}
            value={node.value}
            disabled={node.disabled}
            className={cn(
              "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-1.5 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50",
              hasPreviousGroup ? "mt-4" : "",
            )}
          >
            <span className="min-w-0 flex-1 truncate" title={node.label}>
              <SelectPrimitive.ItemText>{node.label}</SelectPrimitive.ItemText>
            </span>
            <SelectPrimitive.ItemIndicator className="ml-auto flex size-3.5 shrink-0 items-center justify-center">
              <Check className="size-4" />
            </SelectPrimitive.ItemIndicator>
          </SelectPrimitive.SelectItem>
        );

        if (!node.disabled) {
          return option;
        }

        return (
          // disableHoverableContent keeps the tooltip grace area from swallowing hover between adjacent disabled options.
          <Tooltip key={node.value} disableHoverableContent>
            <TooltipTrigger asChild>
              {/* Disabled items ignore pointer events, so this wrapper owns the tooltip trigger. */}
              <div>{option}</div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {node.disabledReason}
            </TooltipContent>
          </Tooltip>
        );
      }

      return assertUnreachable(node);
    },
    [],
  );

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        className="border-input bg-background ring-offset-background placeholder:text-foreground-tertiary focus:ring-ring disabled:bg-muted/50 flex h-8 w-full items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        title={selectedOption?.label}
        {...triggerProps}
      >
        <span
          className="min-w-0 flex-1 truncate text-left"
          title={selectedOption?.label}
        >
          <SelectPrimitive.SelectValue placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative w-(--radix-select-trigger-width) min-w-32 overflow-hidden rounded-md border shadow-md"
        >
          <SelectPrimitive.ScrollUpButton
            aria-label="Scroll up"
            className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 top-0 z-3 flex h-6 items-center justify-center duration-300 [animation-delay:.5s]"
          >
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport
            ref={register}
            onScroll={recompute}
            className={cn(
              "before:from-popover after:from-popover max-h-96 overflow-auto p-1.5 before:pointer-events-none before:sticky before:top-0 before:z-2 before:-mx-1.5 before:-mb-6 before:block before:h-6 before:bg-linear-to-b before:to-transparent before:content-[''] after:pointer-events-none after:sticky after:bottom-0 after:z-2 after:-mx-1.5 after:-mt-6 after:block after:h-6 after:bg-linear-to-t after:to-transparent after:content-['']",
              top ? "before:opacity-100" : "before:opacity-0",
              bottom ? "after:opacity-100" : "after:opacity-0",
            )}
          >
            {options.map((node, index) =>
              renderNode(node, index > 0 && isSelectGroup(options[index - 1])),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton
            aria-label="Scroll down"
            className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 bottom-0 z-3 flex h-6 items-center justify-center duration-300 [animation-delay:.5s]"
          >
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

type SelectInputComponent = {
  <V extends string>(
    props: SelectInputProps<V> & React.RefAttributes<HTMLButtonElement>,
  ): React.ReactElement | null;

  displayName?: string;
};

export const SelectInput = React.forwardRef(
  SelectInputInner,
) as SelectInputComponent;

SelectInput.displayName = "SelectInput";
