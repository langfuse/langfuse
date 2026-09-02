/* eslint-disable @repo/no-style-props */
"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

const accordionTriggerVariants = cva(
  "flex flex-1 items-center font-bold transition-all",
  {
    variants: {
      variant: {
        default:
          "justify-between py-4 hover:underline [&[data-state=open]>svg]:rotate-180",
        plain:
          "justify-between py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180",
        section:
          "justify-between pt-2 pb-1 hover:no-underline [&[data-state=open]>svg]:rotate-180",
        start:
          "justify-start gap-2 py-2 hover:underline [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0",
      },
      size: {
        default: "",
        sm: "text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

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

type AccordionItemProps = Omit<
  Pick<
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>,
    "children" | "className" | "value"
  >,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?:
    | "px-2"
    | "border-b-0"
    | "border-t"
    | "bg-muted/30 rounded-lg border";
};

const Accordion = AccordionPrimitive.Root;

function AccordionItem({ children, className, value }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b", className)}
      value={value}
    >
      {children}
    </AccordionPrimitive.Item>
  );
}

type AccordionTriggerProps = Pick<
  VariantProps<typeof accordionTriggerVariants>,
  "size" | "variant"
> & {
  children: React.ReactNode;
};

function AccordionTrigger({ children, size, variant }: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={accordionTriggerVariants({ size, variant })}
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
