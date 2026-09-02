/* eslint-disable @repo/no-style-props */
"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

const accordionContentVariants = cva("", {
  variants: {
    size: {
      default: "pt-0 pb-4",
      compact: "px-3 pt-1 pb-1",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

type AccordionTriggerProps = Omit<
  Pick<
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>,
    "children" | "className"
  >,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?:
    | "text-sm font-bold"
    | "justify-start gap-2 py-2 text-sm font-bold [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0"
    | "px-3 pt-2 pb-1 hover:no-underline"
    | "px-4 hover:no-underline";
};

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "flex flex-1 items-center justify-between py-4 font-bold transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
          className,
        )}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

type AccordionContentProps = Pick<
  VariantProps<typeof accordionContentVariants>,
  "size"
> & {
  children: React.ReactNode;
};

function AccordionContent({ children, size }: AccordionContentProps) {
  return (
    <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all">
      <div className={accordionContentVariants({ size })}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
