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
import { useWatch } from "react-hook-form";
import { TierConditionsEditor } from "./TierConditionsEditor";
import type { UseFormReturn, FieldArrayWithId } from "react-hook-form";
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
    <AccordionItem value={tier.id} className="bg-muted/30 rounded-lg border">
      <AccordionTrigger className="px-4 hover:no-underline">
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

        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
