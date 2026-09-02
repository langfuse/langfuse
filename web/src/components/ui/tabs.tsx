"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

const tabsListVariants = cva(
  "text-muted-foreground items-center justify-center",
  {
    variants: {
      variant: {
        default: "bg-muted rounded-md",
        underline: "rounded-none border-b bg-transparent",
        outline:
          "bg-background rounded-md border **:data-[state=active]:bg-muted",
      },
      size: {
        default: "",
        sm: "",
        auto: "",
      },
      layout: {
        default: "inline-flex",
        full: "flex w-full",
        "cols-2": "grid w-full grid-cols-2",
        "cols-2-gap": "grid w-full grid-cols-2 gap-1",
        "cols-3": "grid w-full grid-cols-3",
        packed: "grid w-fit max-w-fit grid-flow-col gap-4",
        gap: "inline-flex gap-1",
      },
    },
    compoundVariants: [
      { variant: "default", size: "default", class: "h-8 p-1" },
      { variant: "default", size: "sm", class: "h-6 p-0.5" },
      { variant: "default", size: "auto", class: "h-auto p-1" },
      { variant: "outline", size: "default", class: "h-8 p-1" },
      { variant: "outline", size: "sm", class: "h-6 p-0.5" },
      { variant: "outline", size: "auto", class: "h-auto p-1" },
      { variant: "underline", size: "default", class: "h-auto p-0" },
      { variant: "underline", size: "sm", class: "h-auto p-0" },
      { variant: "underline", size: "auto", class: "h-auto p-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      layout: "default",
    },
  },
);

const tabsTriggerVariants = cva(
  "ring-offset-background focus-visible:ring-ring data-[state=active]:text-foreground inline-flex items-center justify-center gap-1.5 font-bold leading-none whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
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
        sm: "h-5 px-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type TabsListProps = {
  "aria-label"?: string;
  children: React.ReactNode;
} & Pick<VariantProps<typeof tabsListVariants>, "layout" | "size" | "variant">;

const Tabs = TabsPrimitive.Root;

function TabsList({
  "aria-label": ariaLabel,
  children,
  layout,
  size,
  variant,
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={tabsListVariants({ layout, size, variant })}
    >
      {children}
    </TabsPrimitive.List>
  );
}

type TabsTriggerProps = {
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  value: string;
} & Pick<VariantProps<typeof tabsTriggerVariants>, "size" | "variant">;

function TabsTrigger({
  children,
  disabled,
  size,
  title,
  value,
  variant,
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      title={title}
      className={tabsTriggerVariants({ size, variant })}
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
