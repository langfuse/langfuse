"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

const toggleGroupListVariants = cva(
  "text-foreground-tertiary items-center justify-center [&>:not([role=tab])]:flex [&>:not([role=tab])>[role=tab]]:w-full",
  {
    variants: {
      variant: {
        default: "bg-control-track/60 dark:bg-muted rounded-md",
        underline: "rounded-none border-b bg-transparent",
        outline: "bg-background rounded-md border",
      },
      size: {
        default: "",
        md: "",
        sm: "",
        auto: "",
      },
      layout: {
        default: "inline-flex",
        full: "grid w-full auto-cols-fr grid-flow-col",
        packed: "inline-flex",
      },
      gap: {
        none: "",
        sm: "gap-1",
        lg: "gap-4",
      },
    },
    compoundVariants: [
      { variant: "default", size: "default", class: "h-8 p-0.5" },
      { variant: "default", size: "md", class: "h-7 p-0.5" },
      { variant: "default", size: "sm", class: "h-6 p-0.5" },
      { variant: "default", size: "auto", class: "h-auto p-0.5" },
      { variant: "outline", size: "default", class: "h-8 p-0.5" },
      { variant: "outline", size: "md", class: "h-7 p-0.5" },
      { variant: "outline", size: "sm", class: "h-6 p-0.5" },
      { variant: "outline", size: "auto", class: "h-auto p-0.5" },
      { variant: "underline", size: "default", class: "h-auto p-0" },
      { variant: "underline", size: "md", class: "h-auto p-0" },
      { variant: "underline", size: "sm", class: "h-auto p-0" },
      { variant: "underline", size: "auto", class: "h-auto p-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      layout: "default",
      gap: "none",
    },
  },
);

const toggleGroupTriggerVariants = cva(
  "ring-offset-background focus-visible:ring-ring data-[state=active]:text-foreground inline-flex min-w-0 items-center justify-center gap-1.5 font-bold leading-none whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-sm data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:bg-control-track dark:data-[state=active]:text-primary dark:data-[state=active]:shadow-none",
        underline:
          "rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground shadow-none data-[state=active]:border-primary-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none",
      },
      size: {
        default: "h-6 px-4 py-0.5 text-sm",
        lg: "h-7 px-1 text-xs",
        sm: "h-5 px-2 text-xs",
      },
    },
    compoundVariants: [
      // Inside a boxed list the trigger fills the list's inner height, so the
      // list's padding is the inset on every side and the smaller radius
      // nests inside the list's. A fixed height overflowed once the list had
      // a border (outline) and left uneven top/bottom vs side spacing.
      { variant: "default", class: "h-full" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ToggleGroupListProps = {
  "aria-label"?: string;
  children: React.ReactNode;
} & Pick<
  VariantProps<typeof toggleGroupListVariants>,
  "gap" | "layout" | "size" | "variant"
>;
type ToggleGroupRootProps = {
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLDivElement>;
} & (
  | { defaultValue: string; value?: never }
  | { defaultValue?: never; value: string }
);

function ToggleGroupRoot({
  children,
  defaultValue,
  onValueChange,
  ref,
  value,
}: ToggleGroupRootProps) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      ref={ref}
      value={value}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

const ToggleGroupIndicatorContext = React.createContext(false);

function ToggleGroupList({
  "aria-label": ariaLabel,
  children,
  gap,
  layout,
  size,
  variant,
}: ToggleGroupListProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLSpanElement>(null);
  const hasSlidingIndicator = variant !== "underline";

  React.useLayoutEffect(() => {
    if (!hasSlidingIndicator) return;

    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    let frame: number | undefined;
    let readyFrame: number | undefined;
    const updateIndicator = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const activeTrigger = list.querySelector<HTMLElement>(
          '[role="tab"][data-state="active"]',
        );
        if (!activeTrigger) {
          indicator.style.opacity = "0";
          return;
        }

        let triggerOffset = 0;
        let offsetElement: HTMLElement | null = activeTrigger;
        while (offsetElement && offsetElement !== list) {
          triggerOffset += offsetElement.offsetLeft;
          offsetElement = offsetElement.offsetParent as HTMLElement | null;
        }
        if (offsetElement !== list) return;

        indicator.style.width = `${activeTrigger.offsetWidth}px`;
        indicator.style.transform = `translateX(${triggerOffset}px)`;
        indicator.style.opacity = "1";

        if (indicator.dataset.ready !== "true") {
          readyFrame = requestAnimationFrame(() => {
            indicator.dataset.ready = "true";
          });
        }
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateIndicator);
    const observedTriggers = new Set<HTMLElement>();
    const syncObservedTriggers = () => {
      const triggers = new Set(
        list.querySelectorAll<HTMLElement>('[role="tab"]'),
      );

      for (const trigger of observedTriggers) {
        if (!triggers.has(trigger)) {
          resizeObserver?.unobserve(trigger);
          observedTriggers.delete(trigger);
        }
      }
      for (const trigger of triggers) {
        if (!observedTriggers.has(trigger)) {
          resizeObserver?.observe(trigger);
          observedTriggers.add(trigger);
        }
      }
    };
    const mutationObserver = new MutationObserver(() => {
      syncObservedTriggers();
      updateIndicator();
    });
    resizeObserver?.observe(list);
    syncObservedTriggers();
    mutationObserver.observe(list, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    updateIndicator();

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (readyFrame !== undefined) cancelAnimationFrame(readyFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [hasSlidingIndicator]);

  return (
    <ToggleGroupIndicatorContext value={hasSlidingIndicator}>
      <TabsPrimitive.List
        ref={listRef}
        aria-label={ariaLabel}
        className={cn(
          toggleGroupListVariants({ gap, layout, size, variant }),
          hasSlidingIndicator && "relative isolate",
        )}
      >
        {hasSlidingIndicator ? (
          <span
            ref={indicatorRef}
            data-tabs-indicator=""
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0.5 left-0 z-0 rounded-sm opacity-0 data-[ready=true]:transition-[width,transform] data-[ready=true]:duration-200 data-[ready=true]:ease-out motion-reduce:transition-none",
              variant === "outline"
                ? "bg-muted"
                : "bg-background dark:bg-control-track shadow-sm dark:shadow-none",
            )}
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
    </ToggleGroupIndicatorContext>
  );
}

type ToggleGroupTriggerProps = {
  disabled?: boolean;
  icon?: LucideIcon;
  value: string;
} & Pick<VariantProps<typeof toggleGroupTriggerVariants>, "size" | "variant"> &
  (
    | {
        /** Preferred for plain-text trigger content. */
        label: string;
        children?: never;
        title?: never;
      }
    | {
        label?: never;
        /** Rich-content escape hatch. */
        children: React.ReactNode;
        title?: string;
      }
  );

function ToggleGroupTrigger({
  children,
  disabled,
  icon: Icon,
  label,
  size,
  title,
  value,
  variant,
}: ToggleGroupTriggerProps) {
  const slidingIndicator = React.use(ToggleGroupIndicatorContext);

  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      title={label ?? title}
      className={cn(
        toggleGroupTriggerVariants({ size, variant }),
        slidingIndicator &&
          "relative z-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent",
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="icon-base shrink-0" /> : null}
      {label !== undefined ? (
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
      ) : (
        children
      )}
    </TabsPrimitive.Trigger>
  );
}

type ToggleGroupContentProps = {
  children: React.ReactNode;
  value: string;
};

function ToggleGroupContent({ children, value }: ToggleGroupContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className="ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      {children}
    </TabsPrimitive.Content>
  );
}

const ToggleGroup = Object.assign(ToggleGroupRoot, {
  List: ToggleGroupList,
  Trigger: ToggleGroupTrigger,
  Content: ToggleGroupContent,
});

export { ToggleGroup };
