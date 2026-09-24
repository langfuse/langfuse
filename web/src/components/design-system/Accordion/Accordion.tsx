"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

const accordionVariants = cva("", {
  variants: {
    gap: {
      none: "",
      sm: "space-y-2",
    },
  },
  defaultVariants: {
    gap: "none",
  },
});

const accordionTriggerVariants = cva(
  "flex flex-1 items-center justify-between pt-2 pb-1 font-bold transition-all hover:no-underline [&[data-state=open]>svg]:rotate-180",
  {
    variants: {
      size: {
        default: "",
        sm: "text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type AccordionItemProps = Pick<
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>,
  "value"
> & {
  children: React.ReactNode;
};

type AccordionRootProps = React.ComponentPropsWithoutRef<
  typeof AccordionPrimitive.Root
>;

type AccordionSingleProps = Pick<
  Extract<AccordionRootProps, { type: "single" }>,
  "collapsible" | "defaultValue" | "onValueChange" | "type" | "value"
>;

type AccordionMultipleProps = Pick<
  Extract<AccordionRootProps, { type: "multiple" }>,
  "defaultValue" | "onValueChange" | "type" | "value"
>;

type AccordionProps = (AccordionSingleProps | AccordionMultipleProps) &
  Pick<VariantProps<typeof accordionVariants>, "gap"> & {
    children: React.ReactNode;
  };

function AccordionRoot({ children, gap, ...props }: AccordionProps) {
  return (
    <AccordionPrimitive.Root className={accordionVariants({ gap })} {...props}>
      {children}
    </AccordionPrimitive.Root>
  );
}

function AccordionItem({ children, value }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item className="border-b" value={value}>
      {children}
    </AccordionPrimitive.Item>
  );
}

type AccordionTriggerProps = Pick<
  VariantProps<typeof accordionTriggerVariants>,
  "size"
> & {
  children: React.ReactNode;
};

function AccordionTrigger({ children, size }: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={accordionTriggerVariants({ size })}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

type AccordionContentProps = {
  children: React.ReactNode;
};

function AccordionContent({ children }: AccordionContentProps) {
  return (
    <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all">
      {children}
    </AccordionPrimitive.Content>
  );
}

const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
});

export { Accordion };
