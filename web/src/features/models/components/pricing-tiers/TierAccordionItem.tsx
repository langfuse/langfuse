import { Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { TierConditionsEditor } from "./TierConditionsEditor";
import { TierPriceEditor } from "./TierPriceEditor";
import { TierPrefillButtons } from "./TierPrefillButtons";
import type { UseFormReturn, FieldArrayWithId } from "react-hook-form";
import type { FormUpsertModel } from "../../validation";

type TierAccordionItemProps = {
  tier: FieldArrayWithId<FormUpsertModel, "pricingTiers", "id">;
  index: number;
  form: UseFormReturn<FormUpsertModel>;
  remove: (index: number) => void;
  isDefault: boolean;
};

export type { TierAccordionItemProps };

export function TierAccordionItem({
  tier,
  index,
  form,
  remove,
  isDefault,
}: TierAccordionItemProps) {
  return (
    <AccordionItem
      value={`tier-${index}`}
      className="rounded-lg border bg-muted/30"
    >
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{tier.name}</span>
            {isDefault && <Badge variant="secondary">Default</Badge>}
            <span className="text-xs text-muted-foreground">
              Priority: {tier.priority}
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
      </AccordionTrigger>

      <AccordionContent className="space-y-4 px-4 pb-4">
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

        {/* Prices */}
        {isDefault && <TierPrefillButtons tierIndex={index} form={form} />}
        <TierPriceEditor tierIndex={index} form={form} isDefault={isDefault} />
      </AccordionContent>
    </AccordionItem>
  );
}
