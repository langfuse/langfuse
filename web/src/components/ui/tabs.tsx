/* eslint-disable @repo/no-style-props */
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const tabsListVariants = cva(
  "text-muted-foreground inline-flex h-8 items-center justify-center p-1",
  {
    variants: {
      variant: {
        default: "bg-muted rounded-md",
        underline: "rounded-none border-b bg-transparent",
        outline:
          "bg-background rounded-md border **:data-[state=active]:bg-muted",
      },
    },
    defaultVariants: {
      variant: "default",
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
  className?:
    | "grid h-6 w-full grid-cols-3 p-0.5"
    | "grid h-6 w-full grid-cols-2 p-0.5"
    | "grid w-fit max-w-fit grid-flow-col gap-4"
    | "flex h-auto w-full p-0"
    | "h-auto gap-1"
    | "grid h-auto w-full grid-cols-2 gap-1"
    | "flex w-full"
    | "h-7"
    | "h-fit py-0.5"
    | "grid w-full grid-cols-2"
    | "h-fit p-0.5";
} & Pick<VariantProps<typeof tabsListVariants>, "variant">;

const Tabs = TabsPrimitive.Root;

function TabsList({
  "aria-label": ariaLabel,
  children,
  className,
  variant,
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={cn(tabsListVariants({ variant }), className)}
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
