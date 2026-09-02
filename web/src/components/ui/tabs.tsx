/* eslint-disable @repo/no-style-props */
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

type TabsTriggerProps = Omit<
  Pick<
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    "children" | "className" | "disabled" | "title" | "value"
  >,
  "className"
> & {
  className?:
    | "h-5 px-1 text-xs"
    | "h-5 w-full px-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
    | "h-5 px-2 text-xs"
    | "min-w-[100px]"
    | "min-w-[100px] gap-1.5"
    | "text-muted-foreground data-[state=active]:border-primary-accent data-[state=active]:text-foreground h-7 min-w-0 flex-1 rounded-none border-b-2 border-transparent bg-transparent px-1 text-xs shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    | "h-fit px-1 text-xs"
    | "text-xs"
    | "flex-1"
    | "gap-1.5 leading-none";
};

TabsList.displayName = TabsPrimitive.List.displayName;

function TabsTrigger({
  children,
  className,
  disabled,
  title,
  value,
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      title={title}
      className={cn(
        "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-6 items-center justify-center rounded-sm px-2 py-0.5 text-sm font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-xs",
        className,
      )}
    >
      {children}
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
      className="ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      {children}
    </TabsPrimitive.Content>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
