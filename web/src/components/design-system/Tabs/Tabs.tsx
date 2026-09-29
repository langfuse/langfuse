"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

const tabsListVariants = cva(
  "text-muted-foreground items-center justify-center [&>:not([role=tab])]:flex [&>:not([role=tab])>[role=tab]]:w-full",
  {
    variants: {
      variant: {
        default: "bg-muted rounded-md",
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
      { variant: "default", size: "default", class: "h-8 p-1" },
      { variant: "default", size: "md", class: "h-7 p-1" },
      { variant: "default", size: "sm", class: "h-6 p-0.5" },
      { variant: "default", size: "auto", class: "h-auto p-1" },
      { variant: "outline", size: "default", class: "h-8 p-1" },
      { variant: "outline", size: "md", class: "h-7 p-1" },
      { variant: "outline", size: "sm", class: "h-6 p-0.5" },
      { variant: "outline", size: "auto", class: "h-auto p-1" },
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

const tabsTriggerVariants = cva(
  "ring-offset-background focus-visible:ring-ring data-[state=active]:text-foreground inline-flex min-w-0 items-center justify-center gap-1.5 font-bold leading-none whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-sm data-[state=active]:bg-background data-[state=active]:shadow-xs",
        underline:
          "rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground shadow-none data-[state=active]:border-primary-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none",
      },
      size: {
        default: "h-6 px-2 py-0.5 text-sm",
        lg: "h-7 px-1 text-xs",
        sm: "h-5 px-1 text-xs",
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

type TabsListProps = {
  "aria-label"?: string;
  children: React.ReactNode;
} & Pick<
  VariantProps<typeof tabsListVariants>,
  "gap" | "layout" | "size" | "variant"
>;
type TabsRootProps = {
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLDivElement>;
} & (
  | { defaultValue: string; value?: never }
  | { defaultValue?: never; value: string }
);

function TabsRoot({
  children,
  defaultValue,
  onValueChange,
  ref,
  value,
}: TabsRootProps) {
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

const TabsIndicatorContext = React.createContext(false);

function TabsList({
  "aria-label": ariaLabel,
  children,
  gap,
  layout,
  size,
  variant,
}: TabsListProps) {
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
    <TabsIndicatorContext value={hasSlidingIndicator}>
      <TabsPrimitive.List
        ref={listRef}
        aria-label={ariaLabel}
        className={cn(
          tabsListVariants({ gap, layout, size, variant }),
          hasSlidingIndicator && "relative isolate",
        )}
      >
        {hasSlidingIndicator ? (
          <span
            ref={indicatorRef}
            data-tabs-indicator=""
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 z-0 rounded-sm opacity-0 data-[ready=true]:transition-[width,transform] data-[ready=true]:duration-200 data-[ready=true]:ease-out motion-reduce:transition-none",
              variant === "outline" ? "bg-muted" : "bg-background shadow-xs",
            )}
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
    </TabsIndicatorContext>
  );
}

type TabsTriggerProps = {
  disabled?: boolean;
  icon?: LucideIcon;
  value: string;
} & Pick<VariantProps<typeof tabsTriggerVariants>, "size" | "variant"> &
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

function TabsTrigger({
  children,
  disabled,
  icon: Icon,
  label,
  size,
  title,
  value,
  variant,
}: TabsTriggerProps) {
  const slidingIndicator = React.use(TabsIndicatorContext);

  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      title={label ?? title}
      className={cn(
        tabsTriggerVariants({ size, variant }),
        slidingIndicator &&
          "relative z-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none",
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
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

type TabsContentProps = {
  children: React.ReactNode;
  value: string;
};

function TabsContent({ children, value }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className="ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      {children}
    </TabsPrimitive.Content>
  );
}

const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});

export { Tabs };
