import { PlusCircle } from "lucide-react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { FormDescription, FormLabel } from "@/src/components/ui/form";
import { derivePriorities } from "@/src/features/models/fns/derivePriorities";
import { makeUsageTypeKeys } from "@/src/features/models/fns/makeUsageTypeKeys";
import { TierAccordionItem } from "./components/TierAccordionItem";
import { TierPriceEditor } from "./components/TierPriceEditor";
import { TierPrefillButtons } from "./components/TierPrefillButtons";
import type { FormUpsertModel } from "@/src/features/models/validation";

type PricingSectionProps = {
  form: UseFormReturn<FormUpsertModel>;
};

export type { PricingSectionProps };

const NEW_TIER_CONDITION = {
  usageDetailPattern: "^input",
  operator: "gt" as const,
  value: 0,
  caseSensitive: false,
};

export function PricingSection({ form }: PricingSectionProps) {
  const tiers = useFieldArray({ control: form.control, name: "pricingTiers" });
  // Radix seeds `defaultValue` once, at mount, so a tier added later would
  // render collapsed. Track what the user closed instead: new tiers are open.
  const [collapsedTiers, setCollapsedTiers] = useState<string[]>([]);
  const usageTypes = useFieldArray({
    control: form.control,
    name: "usageTypes",
  });

  // Usage types are shared by every tier, so adding one adds a price row to
  // each tier. Renaming or removing touches no other tier's prices at all.
  const addUsageTypes = (names: string[]) => {
    const existing = form.getValues("usageTypes");
    const keys = makeUsageTypeKeys(existing, names.length);
    const rows = names.map((name, index) => ({ key: keys[index], name }));

    usageTypes.append(rows);
    form.getValues("pricingTiers").forEach((_, tierIndex) => {
      rows.forEach((row) =>
        form.setValue(`pricingTiers.${tierIndex}.prices.${row.key}`, "0"),
      );
    });
  };

  // Drop the removed row's prices too, so a later row cannot inherit them.
  const removeUsageType = (index: number) => {
    const removedKey = form.getValues(`usageTypes.${index}.key`);
    usageTypes.remove(index);
    form.getValues("pricingTiers").forEach((tier, tierIndex) => {
      const { [removedKey]: _removed, ...rest } = tier.prices;
      form.setValue(`pricingTiers.${tierIndex}.prices`, rest);
    });
  };

  // These compare LIVE form values, which the schema has not parsed (and so not
  // trimmed) yet — unlike the submitted payload, where the schema owns it.
  const prefillUsageTypes = (names: string[]) => {
    const existing = new Set(
      form.getValues("usageTypes").map((row) => row.name.trim()),
    );
    const missing = names.filter((name) => !existing.has(name));
    if (missing.length > 0) addUsageTypes(missing);
  };

  const addTier = () => {
    const existing = form.getValues("pricingTiers");
    const takenNames = new Set(existing.map((tier) => tier.name.trim()));
    let suffix = 1;
    while (takenNames.has(`Custom Tier ${suffix}`)) suffix++;

    tiers.append({
      name: `Custom Tier ${suffix}`,
      isDefault: false,
      conditions: [{ ...NEW_TIER_CONDITION }],
      // Prices are keyed by usage type row key, so this copies by identity.
      prices: { ...(existing.find((tier) => tier.isDefault)?.prices ?? {}) },
    });
  };

  const priceEditorProps = {
    form,
    usageTypeRows: usageTypes.fields,
    onAddUsageType: () => addUsageTypes([""]),
    onRemoveUsageType: removeUsageType,
  };

  if (tiers.fields.length <= 1) {
    // SIMPLE VIEW: Just show prices for the single default tier
    const defaultTierIndex = Math.max(
      0,
      tiers.fields.findIndex((tier) => tier.isDefault),
    );

    return (
      <div className="space-y-4">
        <div>
          <FormLabel>Prices</FormLabel>
          <FormDescription>
            Set prices per usage type for this model. Usage types must exactly
            match the keys of the ingested usage details.
          </FormDescription>
        </div>

        <TierPrefillButtons onPrefill={prefillUsageTypes} />
        <TierPriceEditor
          {...priceEditorProps}
          tierIndex={defaultTierIndex}
          isDefault={true}
        />

        <Button type="button" variant="ghost" onClick={addTier}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Custom Pricing Tier
        </Button>
      </div>
    );
  }

  const priorities = derivePriorities(tiers.fields);
  const tierIds = tiers.fields.map((field) => field.id);

  // ACCORDION VIEW: Multiple tiers
  return (
    <div className="space-y-4">
      <div>
        <FormLabel>Pricing Tiers</FormLabel>
        <FormDescription>
          Define pricing rules evaluated in priority order. Tiers are checked
          from top to bottom until conditions match.
        </FormDescription>
      </div>

      <AccordionPrimitive.Root
        className="space-y-2"
        type="multiple"
        value={tierIds.filter((id) => !collapsedTiers.includes(id))}
        onValueChange={(open) =>
          setCollapsedTiers(tierIds.filter((id) => !open.includes(id)))
        }
      >
        {tiers.fields.map((field, index) => (
          <TierAccordionItem
            key={field.id}
            tier={field}
            index={index}
            priority={priorities[index]}
            form={form}
            remove={tiers.remove}
            isDefault={field.isDefault}
          >
            {field.isDefault && (
              <TierPrefillButtons onPrefill={prefillUsageTypes} />
            )}
            <TierPriceEditor
              {...priceEditorProps}
              tierIndex={index}
              isDefault={field.isDefault}
            />
          </TierAccordionItem>
        ))}
      </AccordionPrimitive.Root>

      <Button type="button" variant="outline" onClick={addTier}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Custom Tier
      </Button>
    </div>
  );
}
