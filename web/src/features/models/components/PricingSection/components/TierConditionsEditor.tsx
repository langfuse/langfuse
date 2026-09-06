import { PlusCircle, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import type { FormUpsertModel } from "@/src/features/models/validation";
import type { PricingTierCondition } from "@langfuse/shared";
import { useTranslations } from "next-intl";

type TierConditionsEditorProps = {
  tierIndex: number;
  form: UseFormReturn<FormUpsertModel>;
};

export type { TierConditionsEditorProps };

export function TierConditionsEditor({
  tierIndex,
  form,
}: TierConditionsEditorProps) {
  const t = useTranslations("settingsEnterprise.models");
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: `pricingTiers.${tierIndex}.conditions`,
  });

  const replaceCondition = (
    conditionIndex: number,
    condition: PricingTierCondition,
  ) => {
    update(conditionIndex, condition);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FormLabel>{t("common.conditions")}</FormLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            append({
              usageDetailPattern: "",
              operator: "gt",
              value: 0,
              caseSensitive: false,
            })
          }
        >
          <PlusCircle className="mr-1 h-4 w-4" />
          {t("conditions.add")}
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {t.rich("conditions.warning", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
      )}

      {fields.map((condition, conditionIndex) => {
        const isUsageCondition = "usageDetailPattern" in condition;
        const source = isUsageCondition ? "usage_details" : condition.source;

        return (
          <div key={condition.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                {t("conditions.condition", { number: conditionIndex + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(conditionIndex)}
                aria-label={t("conditions.removeAriaLabel", {
                  number: conditionIndex + 1,
                })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <FormItem>
              <FormLabel>{t("conditions.source")}</FormLabel>
              <Select
                value={source}
                onValueChange={(nextSource) => {
                  if (nextSource === "usage_details") {
                    replaceCondition(conditionIndex, {
                      usageDetailPattern: "",
                      operator: "gt",
                      value: 0,
                      caseSensitive: false,
                    });
                  } else {
                    replaceCondition(conditionIndex, {
                      source: nextSource as "model_parameters" | "metadata",
                      key: "",
                      operator: "in",
                      values: [""],
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usage_details">
                    {t("conditions.usageDetails")}
                  </SelectItem>
                  <SelectItem value="model_parameters">
                    {t("conditions.modelParameters")}
                  </SelectItem>
                  <SelectItem value="metadata">
                    {t("conditions.metadata")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormItem>

            <FormField
              control={form.control}
              name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.${isUsageCondition ? "usageDetailPattern" : "key"}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isUsageCondition
                      ? t("conditions.usagePattern")
                      : t("conditions.topLevelKey")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value as string}
                      placeholder={
                        isUsageCondition
                          ? "^input"
                          : source === "model_parameters"
                            ? "service_tier"
                            : "model_provider"
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {isUsageCondition
                      ? t("conditions.usageDescription")
                      : t("conditions.keyDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Operator + Value */}
            <div className="grid grid-cols-2 gap-2">
              {isUsageCondition ? (
                <FormField
                  control={form.control}
                  name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.operator`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("conditions.operator")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gt">
                            {t("conditions.greaterThan")}
                          </SelectItem>
                          <SelectItem value="gte">
                            {t("conditions.greaterOrEqual")}
                          </SelectItem>
                          <SelectItem value="lt">
                            {t("conditions.lessThan")}
                          </SelectItem>
                          <SelectItem value="lte">
                            {t("conditions.lessOrEqual")}
                          </SelectItem>
                          <SelectItem value="eq">
                            {t("conditions.equals")}
                          </SelectItem>
                          <SelectItem value="neq">
                            {t("conditions.notEquals")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormItem>
                  <FormLabel>{t("conditions.operator")}</FormLabel>
                  <Input disabled value={t("conditions.inAnyOf")} />
                </FormItem>
              )}

              <FormField
                control={form.control}
                name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.${isUsageCondition ? "value" : "values"}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isUsageCondition
                        ? t("common.value")
                        : t("common.values")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type={isUsageCondition ? "number" : "text"}
                        {...field}
                        value={
                          !isUsageCondition
                            ? ((field.value as string[]) ?? []).join(", ")
                            : (field.value as string | number)
                        }
                        placeholder={
                          !isUsageCondition ? "fast, priority" : undefined
                        }
                        onChange={(e) =>
                          field.onChange(
                            isUsageCondition
                              ? parseFloat(e.target.value)
                              : e.target.value
                                  .split(",")
                                  .map((value) => value.trim()),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                    {!isUsageCondition && (
                      <FormDescription>
                        {t("conditions.exactValuesDescription")}
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
            </div>

            {isUsageCondition && (
              <FormField
                control={form.control}
                name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.caseSensitive`}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mt-0!">
                      {t("conditions.caseSensitive")}
                    </FormLabel>
                  </FormItem>
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
