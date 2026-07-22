"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/src/utils/tailwind";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "bg-muted text-muted-foreground inline-flex h-8 items-center justify-center rounded-md p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-6 items-center justify-center rounded-sm px-2 py-0.5 text-sm font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-xs",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/**
 * TabsList variant whose active-pill highlight slides between triggers
 * instead of jumping. The pill is a single positioned thumb measured off the
 * active trigger (found via its data-state, so no value plumbing) — pair it
 * with AnimatedTabsTrigger, which paints no background of its own.
 */
const AnimatedTabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(ref, () => listRef.current!);
  const [thumb, setThumb] = React.useState<{
    left: number;
    width: number;
  } | null>(null);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const active = list.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      setThumb(
        active ? { left: active.offsetLeft, width: active.offsetWidth } : null,
      );
    };
    update();
    // Radix flips data-state on selection; sizes change with content/zoom.
    const mutations = new MutationObserver(update);
    mutations.observe(list, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-state"],
    });
    const resizes = new ResizeObserver(update);
    resizes.observe(list);
    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn(
        "bg-muted text-muted-foreground relative inline-flex h-8 items-center justify-center rounded-md p-1",
        className,
      )}
      {...props}
    >
      {thumb && (
        <span
          aria-hidden
          className="bg-background absolute inset-y-1 rounded-sm shadow-xs transition-[left,width] duration-200 ease-out"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
});
AnimatedTabsList.displayName = "AnimatedTabsList";

/** Trigger for AnimatedTabsList: the sliding thumb carries the background,
    so the trigger only transitions its text color. */
const AnimatedTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring data-[state=active]:text-foreground relative inline-flex h-6 items-center justify-center rounded-sm px-2 py-0.5 text-sm font-bold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
AnimatedTabsTrigger.displayName = "AnimatedTabsTrigger";

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  AnimatedTabsList,
  AnimatedTabsTrigger,
};
