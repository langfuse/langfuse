import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  useWatch,
  type UseFormReturn,
  type FieldArrayWithId,
} from "react-hook-form";
import { TierConditionsEditor } from "./TierConditionsEditor";
import type { FormUpsertModel } from "@/src/features/models/validation";

type TierAccordionItemProps = {
  tier: FieldArrayWithId<FormUpsertModel, "pricingTiers", "id">;
  index: number;
  priority: number;
  form: UseFormReturn<FormUpsertModel>;
  remove: (index: number) => void;
  isDefault: boolean;
  children: React.ReactNode;
};

export type { TierAccordionItemProps };

export function TierAccordionItem({
  tier,
  index,
  priority,
  form,
  remove,
  isDefault,
  children,
}: TierAccordionItemProps) {
  const name = useWatch({
    control: form.control,
    name: `pricingTiers.${index}.name`,
  });

  return (
    <AccordionPrimitive.Item
      className="bg-muted/30 rounded-lg border"
      value={tier.id}
    >
      <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between px-4 py-4 font-bold transition-all hover:no-underline [&[data-state=open]>svg]:rotate-180">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold">{name ?? tier.name}</span>
              {isDefault && <Badge variant="secondary">Default</Badge>}
              <span className="text-muted-foreground text-xs">
                Priority: {priority}
              </span>
            </div>
            {!isDefault && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(index);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>

      <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all">
        <div className="space-y-4 px-4 pt-0 pb-4">
          {/* Tier Name */}
          <FormField
            control={form.control}
            name={`pricingTiers.${index}.name`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tier Name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isDefault} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Conditions (only for non-default) */}
          {!isDefault && <TierConditionsEditor tierIndex={index} form={form} />}

          {children}
        </div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}
