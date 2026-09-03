"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

const tabsListVariants = cva(
  "text-muted-foreground items-center justify-center [&>:not([role=tab])]:flex [&>:not([role=tab])>[role=tab]]:w-full",
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

function TabsList({
  "aria-label": ariaLabel,
  children,
  gap,
  layout,
  size,
  variant,
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={tabsListVariants({ gap, layout, size, variant })}
    >
      {children}
    </TabsPrimitive.List>
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
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      title={label ?? title}
      className={tabsTriggerVariants({ size, variant })}
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
