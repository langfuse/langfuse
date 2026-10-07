"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import Link, { type LinkProps } from "next/link";

import { cn } from "@/src/utils/tailwind";

type TabsVariant = "inset" | "underline";
type TabsInsetSize = "sm" | "md";
/** `navigation` is the underline look for link tabs: the page header owns the divider. */
type TabsLook = TabsVariant | "navigation";

const rootFillClassName =
  "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden";

const tabsListVariants = cva(
  "items-center [&>:not([role=tab])]:flex [&>:not([role=tab])>[role=tab]]:w-full",
  {
    variants: {
      look: {
        inset:
          "bg-control-track/60 dark:bg-muted text-foreground-tertiary relative isolate justify-center rounded-md p-0.5",
        underline: "h-9 shrink-0 justify-start border-b",
        navigation: "h-9 shrink-0 justify-start",
      },
      size: {
        sm: "",
        md: "",
      },
      layout: {
        default: "",
        full: "grid w-full auto-cols-fr grid-flow-col",
        packed: "",
      },
      gap: {
        none: "",
        sm: "gap-1",
        lg: "gap-4",
      },
    },
    compoundVariants: [
      { look: "inset", size: "sm", class: "h-6" },
      { look: "inset", size: "md", class: "h-7" },
      { look: "inset", layout: ["default", "packed"], class: "inline-flex" },
      {
        look: ["underline", "navigation"],
        layout: ["default", "packed"],
        class: "flex w-full",
      },
    ],
    defaultVariants: {
      layout: "default",
      gap: "none",
    },
  },
);

const tabsTriggerVariants = cva(
  "ring-offset-background focus-visible:ring-ring data-[state=active]:text-foreground inline-flex h-full items-center justify-center gap-1.5 font-bold leading-none whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      look: {
        inset:
          "relative z-1 min-w-0 rounded-sm dark:data-[state=active]:text-primary",
        underline:
          "text-muted-foreground data-[state=active]:border-foreground-secondary rounded-none border-b-2 border-transparent bg-transparent px-4 text-sm",
        navigation:
          "text-muted-foreground data-[state=active]:border-foreground-secondary rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm",
      },
      size: {
        sm: "px-2 text-xs",
        md: "px-4 text-sm",
      },
    },
  },
);

type TabsRootProps = {
  children: React.ReactNode;
  /** `fill`: a column that takes its flex parent's remaining height, for `Tabs.Content layout="fill"`. */
  layout?: "fill";
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLDivElement>;
} & (
  | { defaultValue: string; value?: never }
  | { defaultValue?: never; value: string }
);

const TabsRootContext = React.createContext(false);

function TabsRoot({
  children,
  defaultValue,
  layout,
  onValueChange,
  ref,
  value,
}: TabsRootProps) {
  return (
    <TabsRootContext value={true}>
      <TabsPrimitive.Root
        className={layout === "fill" ? rootFillClassName : undefined}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        ref={ref}
        value={value}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsRootContext>
  );
}

type TabsListProps = {
  "aria-label"?: string;
  children: React.ReactNode;
  gap?: "none" | "sm" | "lg";
  layout?: "default" | "full" | "packed";
} & (
  | { variant: "inset"; size: TabsInsetSize }
  | { variant: "underline"; size?: never }
);

const TabsListContext = React.createContext<{
  look: TabsLook;
  size?: TabsInsetSize;
} | null>(null);

/** Outside a `Tabs` root the list is page navigation: a `<nav>` of link triggers, not a tablist. */
function TabsList({
  "aria-label": ariaLabel,
  children,
  gap,
  layout,
  size,
  variant,
}: TabsListProps) {
  const inRoot = React.use(TabsRootContext);
  const look: TabsLook =
    variant === "underline" && !inRoot ? "navigation" : variant;
  const listRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLSpanElement>(null);
  const hasSlidingIndicator = look === "inset";

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

  const className = tabsListVariants({ gap, layout, look, size });

  if (look === "navigation") {
    return (
      <TabsListContext value={{ look }}>
        <nav aria-label={ariaLabel} className={className}>
          {children}
        </nav>
      </TabsListContext>
    );
  }

  return (
    <TabsListContext value={{ look, size }}>
      <TabsPrimitive.List
        ref={listRef}
        aria-label={ariaLabel}
        className={className}
      >
        {hasSlidingIndicator ? (
          <span
            ref={indicatorRef}
            data-tabs-indicator=""
            aria-hidden="true"
            className="bg-background dark:bg-control-track pointer-events-none absolute inset-y-0.5 left-0 z-0 rounded-sm opacity-0 shadow-sm data-[ready=true]:transition-[width,transform] data-[ready=true]:duration-200 data-[ready=true]:ease-out motion-reduce:transition-none dark:shadow-none"
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
    </TabsListContext>
  );
}

type TabsTriggerProps = {
  disabled?: boolean;
  icon?: LucideIcon;
} & (
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
) &
  (
    | { value: string; href?: never; active?: never; onClick?: never }
    | {
        /** Renders a Next.js link with `aria-current` instead of a tab. */
        href: LinkProps["href"];
        active: boolean;
        onClick?: () => void;
        value?: never;
      }
  );

function TabsTrigger(props: TabsTriggerProps) {
  const list = React.use(TabsListContext);
  if (!list) {
    throw new Error("Tabs.Trigger must be rendered inside Tabs.List");
  }
  const { children, disabled, icon: Icon, label, title } = props;
  const className = tabsTriggerVariants({ look: list.look, size: list.size });
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" className="icon-base shrink-0" /> : null}
      {label !== undefined ? (
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
      ) : (
        children
      )}
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        onClick={props.onClick}
        aria-current={props.active ? "page" : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        data-state={props.active ? "active" : "inactive"}
        title={label ?? title}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <TabsPrimitive.Trigger
      value={props.value}
      disabled={disabled}
      title={label ?? title}
      className={className}
    >
      {content}
    </TabsPrimitive.Trigger>
  );
}

type TabsContentProps = {
  children: React.ReactNode;
  /** `fill`: a column that takes the remaining height of a `layout="fill"` root. */
  layout?: "fill";
  value: string;
};

function TabsContent({ children, layout, value }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn(
        "ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        layout === "fill" &&
          "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
      )}
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
