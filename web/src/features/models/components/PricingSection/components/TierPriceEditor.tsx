import { MinusCircle, PlusCircle } from "lucide-react";
import {
  useWatch,
  type FieldArrayWithId,
  type UseFormReturn,
} from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { parsePriceInput } from "@/src/features/models/fns/parsePriceInput";
import { PricePreview } from "@/src/features/models/components/PricePreview";
import type { FormUpsertModel } from "@/src/features/models/validation";
import { useTranslations } from "next-intl";

type TierPriceEditorProps = {
  tierIndex: number;
  form: UseFormReturn<FormUpsertModel>;
  isDefault: boolean;
  usageTypeRows: FieldArrayWithId<FormUpsertModel, "usageTypes", "id">[];
  onAddUsageType: () => void;
  onRemoveUsageType: (index: number) => void;
};

export type { TierPriceEditorProps };

export function TierPriceEditor({
  tierIndex,
  form,
  isDefault,
  usageTypeRows,
  onAddUsageType,
  onRemoveUsageType,
}: TierPriceEditorProps) {
  const t = useTranslations("settingsEnterprise.models");
  // Names live on the model, prices on the tier; both are watched so a rename
  // in the default tier shows up in every tier's rows immediately.
  const usageTypeValues = useWatch({
    control: form.control,
    name: "usageTypes",
  });
  const tierPrices = useWatch({
    control: form.control,
    name: `pricingTiers.${tierIndex}.prices`,
  });
  const tierName = useWatch({
    control: form.control,
    name: `pricingTiers.${tierIndex}.name`,
  });

  const nameOf = (index: number) =>
    usageTypeValues?.[index]?.name ?? usageTypeRows[index]?.name ?? "";

  const previewPrices = usageTypeRows.flatMap((row, index) => {
    const price = parsePriceInput(tierPrices?.[row.key]);
    const usageType = nameOf(index).trim();
    return price === null || !usageType
      ? []
      : [{ key: row.key, usageType, price }];
  });

  return (
    <div className="space-y-3">
      <FormLabel>{t("common.prices")}</FormLabel>
      <div className="text-muted-foreground grid grid-cols-2 gap-1 text-sm">
        <span>{t("common.usageType")}</span>
        <span>{t("common.pricePerUnit")}</span>
      </div>
      {usageTypeRows.map((row, index) => (
        // The row key is opaque form state, so no edit can reorder or remount
        // these inputs.
        <div key={row.key} className="grid grid-cols-2 items-start gap-1">
          {isDefault ? (
            <FormField
              control={form.control}
              name={`usageTypes.${index}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("pricingEditor.usageTypePlaceholder")}
                      aria-label={t("pricingEditor.usageTypeAriaLabel", {
                        number: index + 1,
                      })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            // Usage types belong to the default tier; here they are just labels.
            <span
              className="flex h-9 items-center truncate text-sm"
              title={nameOf(index)}
            >
              {nameOf(index)}
            </span>
          )}
          <div className="flex gap-1">
            <FormField
              control={form.control}
              name={`pricingTiers.${tierIndex}.prices.${row.key}`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      inputMode="decimal"
                      placeholder={t("common.pricePerUnit")}
                      aria-label={t("pricingEditor.priceAriaLabel", {
                        tierName,
                        usageType:
                          nameOf(index) ||
                          t("pricingEditor.usageTypeAriaLabel", {
                            number: index + 1,
                          }),
                      })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isDefault && (
              <Button
                type="button"
                variant="outline"
                title={t("pricingEditor.removePrice")}
                size="icon"
                disabled={usageTypeRows.length <= 1}
                onClick={() => onRemoveUsageType(index)}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {isDefault && (
        <Button
          type="button"
          variant="ghost"
          onClick={onAddUsageType}
          className="flex items-center gap-1"
        >
          <PlusCircle className="h-4 w-4" />
          <span>{t("pricingEditor.addPrice")}</span>
        </Button>
      )}
      <PricePreview prices={previewPrices} />
    </div>
  );
}
