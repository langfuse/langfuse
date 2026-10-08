"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { InputDropdown } from "@/src/components/design-system/internal/InputDropdown/InputDropdown";

type SelectOption<V> = {
  value: V;
  label: string;
  badges?: Array<
    Pick<React.ComponentProps<typeof Badge>, "text" | "color" | "title">
  >;
} & (
  | { disabled?: false; disabledReason?: never }
  | { disabled: true; disabledReason: string }
);

type SelectNode<V> =
  | SelectOption<V>
  | {
      type: "group";
      id: string;
      label: string;
      options: SelectOption<V>[];
    };

function isSelectGroup<V>(
  node: SelectNode<V>,
): node is Extract<SelectNode<V>, { type: "group" }> {
  return "type" in node && node.type === "group";
}

type TriggerControls = {
  getTriggerProps: (
    props?: React.ComponentPropsWithoutRef<"button">,
  ) => React.ComponentPropsWithRef<"button">;
};

// Radix injects its trigger handlers and measurement ref through asChild.
// Forward them to the registered button even when the caller wraps it in styling.
const RegisteredTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<"button">, "children"> & {
    children: (controls: TriggerControls) => React.ReactNode;
  }
>(({ children, ...triggerProps }, ref) =>
  children({
    getTriggerProps: (props = {}) => ({
      ...triggerProps,
      ...props,
      ref,
      onClick: (event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) triggerProps.onClick?.(event);
      },
      onPointerDown: (event) => {
        props.onPointerDown?.(event);
        if (!event.defaultPrevented) triggerProps.onPointerDown?.(event);
      },
      onKeyDown: (event) => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented) triggerProps.onKeyDown?.(event);
      },
    }),
  }),
);
RegisteredTrigger.displayName = "RegisteredTrigger";

export function SelectDropdown<V extends string>({
  value,
  options,
  onValueChange,
  emptyMessage = "No options available.",
  children,
  ref,
  ...triggerProps
}: {
  value: V;
  options: SelectNode<V>[];
  onValueChange: (value: V) => void;
  emptyMessage?: string;
  children: (
    controls: TriggerControls & { selectedLabel: string | undefined },
  ) => React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
} & Pick<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "id" | "aria-describedby" | "aria-invalid" | "aria-label" | "disabled"
>) {
  const container = useLayerContainer("popover");
  const selectedOption = options
    .flatMap((node) => (isSelectGroup(node) ? node.options : [node]))
    .find((option) => option.value === value);
  const hasOptions = options.some((node) =>
    isSelectGroup(node) ? node.options.length > 0 : true,
  );
  const renderNode = (
    node: SelectNode<V>,
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

    return (
      <React.Fragment key={node.value}>
        {hasPreviousGroup && <div aria-hidden="true" className="h-4" />}
        <InputDropdown.Option highlight="focus">
          <SelectPrimitive.Item value={node.value} disabled={node.disabled}>
            <InputDropdown.OptionContent
              type="radio"
              checked={value === node.value}
              label={
                <SelectPrimitive.ItemText>
                  {node.label}
                </SelectPrimitive.ItemText>
              }
              title={node.disabled ? node.disabledReason : node.label}
              badges={node.badges?.map((badge, index) => (
                <Badge key={index} {...badge} />
              ))}
            />
          </SelectPrimitive.Item>
        </InputDropdown.Option>
      </React.Fragment>
    );
  };

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        asChild
        ref={ref}
        title={selectedOption?.label}
        {...triggerProps}
      >
        <RegisteredTrigger>
          {(controls) =>
            children({ ...controls, selectedLabel: selectedOption?.label })
          }
        </RegisteredTrigger>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <InputDropdown.Content width="select-trigger">
          <SelectPrimitive.Content position="popper" sideOffset={4}>
            <SelectPrimitive.ScrollUpButton
              aria-label="Scroll up"
              className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 top-0 z-3 flex h-6 cursor-pointer items-center justify-center duration-300 [animation-delay:.5s]"
            >
              <ChevronUp className="icon-base" />
            </SelectPrimitive.ScrollUpButton>
            <InputDropdown.List>
              <SelectPrimitive.Viewport>
                {!hasOptions ? (
                  <div className="text-muted-foreground py-6 text-center text-sm">
                    {emptyMessage}
                  </div>
                ) : (
                  options.map((node, index) =>
                    renderNode(
                      node,
                      index > 0 && isSelectGroup(options[index - 1]),
                    ),
                  )
                )}
              </SelectPrimitive.Viewport>
            </InputDropdown.List>
            <SelectPrimitive.ScrollDownButton
              aria-label="Scroll down"
              className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 bottom-0 z-3 flex h-6 cursor-pointer items-center justify-center duration-300 [animation-delay:.5s]"
            >
              <ChevronDown className="icon-base" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </InputDropdown.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
