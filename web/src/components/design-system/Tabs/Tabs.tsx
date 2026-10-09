"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva } from "class-variance-authority";
import { EllipsisVertical, type LucideIcon } from "lucide-react";
import Link, { type LinkProps } from "next/link";
import { flushSync } from "react-dom";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { getVisibleRowItemIndices } from "@/src/utils/getVisibleRowItemIndices";
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
  /** `manual`: arrow keys only move focus; Enter/Space selects. For form inputs where a focus must not commit a value. */
  activationMode?: "automatic" | "manual";
  children: React.ReactNode;
  /** `fill`: a column that takes its flex parent's remaining height, for `Tabs.Content layout="fill"`. */
  layout?: "fill";
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLDivElement>;
} & (
  | { defaultValue: string; value?: never }
  | { defaultValue?: never; value: string }
);

/** The root's own props; `Tabs.List overflow="menu"` reads the active value from a controlled root. */
const TabsRootContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
} | null>(null);

function TabsRoot({
  activationMode,
  children,
  defaultValue,
  layout,
  onValueChange,
  ref,
  value,
}: TabsRootProps) {
  return (
    <TabsRootContext value={{ value, onValueChange }}>
      <TabsPrimitive.Root
        activationMode={activationMode}
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
  | { variant: "inset"; size: TabsInsetSize; overflow?: never }
  | {
      variant: "underline";
      size?: never;
      /**
       * `menu`: shows the `Tabs.Trigger` children that fit, the active one
       * always, and lists the rest in a menu. Needs a controlled root; the
       * list fills a flex row the caller owns, which sets height and divider.
       */
      overflow?: "menu";
    }
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
  overflow,
  size,
  variant,
}: TabsListProps) {
  const inRoot = React.use(TabsRootContext) !== null;
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

  if (overflow === "menu" && inRoot) {
    return (
      <TabsOverflowList aria-label={ariaLabel}>{children}</TabsOverflowList>
    );
  }

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
  /** Marks an internal-only feature with the Internal badge, in the row and in the overflow menu. */
  internal?: boolean;
} & (
  | {
      /** Preferred for plain-text trigger content. */
      label: string;
      /** Rich tooltip on the label; replaces the native title. */
      tooltip?: string;
      children?: never;
      title?: never;
    }
  | {
      label?: never;
      tooltip?: never;
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

function TabsInternalBadge() {
  return <Badge text="Internal" color="yellow" size="sm" />;
}

function TabsTriggerContent({
  children,
  icon: Icon,
  internal,
  label,
  tooltip,
}: Pick<
  TabsTriggerProps,
  "children" | "icon" | "internal" | "label" | "tooltip"
>) {
  const renderLabel = (triggerProps?: Record<string, unknown>) => (
    <span
      {...triggerProps}
      className="min-w-0 truncate leading-normal"
      title={tooltip ? undefined : label}
    >
      {label}
    </span>
  );

  const renderContent = () => {
    if (label === undefined) return children;
    if (!tooltip) return renderLabel();
    return (
      <Tooltip label={tooltip}>
        {({ getTriggerProps }) => renderLabel(getTriggerProps())}
      </Tooltip>
    );
  };

  return (
    <>
      {Icon ? <Icon aria-hidden="true" className="icon-base shrink-0" /> : null}
      {renderContent()}
      {/* In a tight row the badge gives way before the label. */}
      {internal ? (
        <span className="flex min-w-0 shrink-100 overflow-hidden">
          <TabsInternalBadge />
        </span>
      ) : null}
    </>
  );
}

function TabsTrigger(props: TabsTriggerProps) {
  // Outside a Tabs.List, fall back to the underline look instead of crashing.
  const list = React.use(TabsListContext) ?? { look: "underline" as const };
  const { children, disabled, icon, internal, label, title, tooltip } = props;
  const className = tabsTriggerVariants({ look: list.look, size: list.size });
  const nativeTitle = tooltip ? undefined : (label ?? title);
  const content = (
    <TabsTriggerContent
      icon={icon}
      internal={internal}
      label={label}
      tooltip={tooltip}
    >
      {children}
    </TabsTriggerContent>
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
        title={nativeTitle}
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
      title={nativeTitle}
      className={className}
    >
      {content}
    </TabsPrimitive.Trigger>
  );
}

/**
 * Measures every tab from a hidden replica row and reports which ones fit next
 * to the overflow trigger inside the list on `availableRef`.
 *
 * The replica row on `measureRef` holds one child per tab, in order, followed
 * by a replica of the overflow trigger. It stays mounted and sized to its
 * content, so hidden tabs remain measurable and the row can bring them back.
 *
 * `measureKey` must change whenever the tabs' identity, order or labels change,
 * so the widths are read again in the new order. Size changes inside a replica,
 * such as a badge appearing, are picked up by observing each replica.
 *
 * `visibleIndices` is null until the first measurement, so callers can hold
 * the row back instead of painting the wrong set. Every later change is
 * committed before the browser paints, so the swap never flashes.
 *
 * The list must not derive its width from the visible tabs, otherwise the two
 * measurements feed back into each other. A flex item with a zero flex basis
 * satisfies this.
 */
function useTabsOverflow<
  TAvailable extends HTMLElement,
  TMeasure extends HTMLElement,
>(measureKey: string, activeIndex: number) {
  const availableRef = React.useRef<TAvailable>(null);
  const measureRef = React.useRef<TMeasure>(null);
  const [metrics, setMetrics] = React.useState<{
    availableWidth: number;
    overflowWidth: number;
    widths: number[];
  }>();

  React.useLayoutEffect(() => {
    const available = availableRef.current;
    const measure = measureRef.current;
    if (!available || !measure) return;

    const read = () => {
      const widths = Array.from(
        measure.children,
        (child) => child.getBoundingClientRect().width,
      );
      const overflowWidth = widths.pop() ?? 0;
      return { availableWidth: available.clientWidth, overflowWidth, widths };
    };

    setMetrics(read());

    if (typeof ResizeObserver === "undefined") return;

    // Resize callbacks run before paint; a synchronous commit keeps it that way.
    const resizeObserver = new ResizeObserver(() => {
      flushSync(() => setMetrics(read()));
    });
    resizeObserver.observe(available);
    for (const replica of measure.children) {
      resizeObserver.observe(replica);
    }

    return () => resizeObserver.disconnect();
  }, [measureKey]);

  const visibleIndices = React.useMemo(
    () =>
      metrics
        ? getVisibleRowItemIndices({ ...metrics, pinnedIndex: activeIndex })
        : null,
    [activeIndex, metrics],
  );

  return { availableRef, measureRef, visibleIndices };
}

type TabsTriggerElement = React.ReactElement<
  Extract<TabsTriggerProps, { value: string }>
>;

function isTabsTriggerElement(
  child: React.ReactNode,
): child is TabsTriggerElement {
  return (
    React.isValidElement(child) &&
    child.type === TabsTrigger &&
    typeof (child.props as TabsTriggerProps).value === "string"
  );
}

const overflowTriggerLabel = "More tabs";

function TabsOverflowTrigger(
  props: Omit<
    React.ComponentProps<typeof IconButton>,
    "icon" | "label" | "size" | "variant"
  >,
) {
  return (
    <IconButton
      {...props}
      icon={EllipsisVertical}
      label={overflowTriggerLabel}
      size="md"
      variant="ghost"
    />
  );
}

/** The underline list with `overflow="menu"`; only direct `Tabs.Trigger` children take part. */
function TabsOverflowList({
  "aria-label": ariaLabel,
  children,
}: Pick<TabsListProps, "aria-label" | "children">) {
  const root = React.use(TabsRootContext);
  const triggers =
    React.Children.toArray(children).filter(isTabsTriggerElement);
  const activeIndex = triggers.findIndex(
    (trigger) => trigger.props.value === root?.value,
  );
  const measureKey = JSON.stringify(
    triggers.map((trigger) => [
      trigger.props.value,
      trigger.props.label ?? trigger.props.title ?? null,
    ]),
  );
  const { availableRef, measureRef, visibleIndices } = useTabsOverflow<
    HTMLDivElement,
    HTMLDivElement
  >(measureKey, activeIndex);
  const visible = new Set(visibleIndices ?? triggers.map((_, index) => index));
  const hiddenTriggers = triggers.filter((_, index) => !visible.has(index));
  const replicaClassName = tabsTriggerVariants({ look: "underline" });
  const rowRef = React.useRef<HTMLDivElement>(null);

  const selectFromMenu = (value: string) => {
    root?.onValueChange?.(value);
    // The menu hands focus back to its trigger in a microtask, and that
    // trigger is gone once every tab fits; the selected tab takes focus after.
    requestAnimationFrame(() => {
      rowRef.current
        ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
        ?.focus();
    });
  };

  return (
    <TabsListContext value={{ look: "underline" }}>
      {/* A zero flex basis makes the list the space left over by the caller's
          controls, so the triggers never feed back into the width they are
          compared against. */}
      <TabsPrimitive.List
        ref={availableRef}
        aria-label={ariaLabel}
        className="relative flex h-full min-w-0 flex-1 items-center justify-start overflow-x-clip"
      >
        {/* Non-interactive replicas keep every trigger measurable, including
            the hidden ones, without duplicating tab semantics. */}
        <div
          ref={measureRef}
          aria-hidden="true"
          className="invisible absolute flex h-full w-max items-center"
        >
          {triggers.map((trigger) => (
            <span key={trigger.props.value} className={replicaClassName}>
              <TabsTriggerContent
                icon={trigger.props.icon}
                internal={trigger.props.internal}
                label={trigger.props.label}
              >
                {trigger.props.children}
              </TabsTriggerContent>
            </span>
          ))}
          <TabsOverflowTrigger tabIndex={-1} />
        </div>
        <div
          ref={rowRef}
          className={cn(
            // A tab wider than the row truncates; the overflow trigger never clips.
            "flex h-full min-w-0 items-center [&>[role=tab]]:min-w-0",
            visibleIndices === null && "invisible",
          )}
        >
          {triggers.map((trigger, index) =>
            visible.has(index) ? trigger : null,
          )}
          {hiddenTriggers.length > 0 ? (
            <span className="flex shrink-0">
              <DropdownMenu
                ariaLabel={overflowTriggerLabel}
                items={hiddenTriggers.map((trigger) => ({
                  badge: trigger.props.internal ? (
                    <TabsInternalBadge />
                  ) : undefined,
                  disabled: trigger.props.disabled
                    ? { reason: trigger.props.tooltip ?? "Not available" }
                    : undefined,
                  id: trigger.props.value,
                  onClick: () => selectFromMenu(trigger.props.value),
                  title:
                    trigger.props.label ??
                    trigger.props.title ??
                    trigger.props.value,
                  tooltip: trigger.props.tooltip,
                  type: "item" as const,
                }))}
              >
                {({ getTriggerProps }) => (
                  <TabsOverflowTrigger {...getTriggerProps()} />
                )}
              </DropdownMenu>
            </span>
          ) : null}
        </div>
      </TabsPrimitive.List>
    </TabsListContext>
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
