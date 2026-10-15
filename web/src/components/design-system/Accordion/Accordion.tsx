"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cva, type VariantProps } from "class-variance-authority";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";

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
  "flex flex-1 items-center justify-between font-bold transition-all hover:no-underline",
  {
    variants: {
      variant: {
        default: "pt-2 pb-1 [&[data-state=open]>svg]:rotate-180",
        summary:
          "hover:bg-muted/20 gap-2 rounded-sm border px-3 py-2 text-left [&[data-state=open]>svg]:rotate-90",
        compact:
          "hover:bg-muted/20 shrink-0 gap-1.5 rounded-sm px-1 py-0.5 [&[data-state=open]>svg]:rotate-90",
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

const accordionItemVariants = cva("", {
  variants: {
    variant: {
      default: "border-b",
      plain: "",
    },
  },
  defaultVariants: { variant: "default" },
});

type AccordionItemProps = Pick<
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>,
  "value"
> &
  Pick<VariantProps<typeof accordionItemVariants>, "variant"> & {
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

function AccordionItem({ children, value, variant }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item
      className={accordionItemVariants({ variant })}
      value={value}
    >
      {children}
    </AccordionPrimitive.Item>
  );
}

type AccordionTriggerProps = Pick<
  VariantProps<typeof accordionTriggerVariants>,
  "size" | "variant"
> &
  Pick<
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>,
    "aria-label"
  > & {
    children: React.ReactNode;
  };

function AccordionTrigger({
  children,
  size,
  variant = "default",
  "aria-label": ariaLabel,
}: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={accordionTriggerVariants({ size, variant })}
        aria-label={ariaLabel}
      >
        {children}
        <DropdownIndicator
          direction={variant === "default" ? "down" : "right"}
        />
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
