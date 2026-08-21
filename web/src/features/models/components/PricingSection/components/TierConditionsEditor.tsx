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

type TierConditionsEditorProps = {
  tierIndex: number;
  form: UseFormReturn<FormUpsertModel>;
};

export type { TierConditionsEditorProps };

export function TierConditionsEditor({
  tierIndex,
  form,
}: TierConditionsEditorProps) {
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
        <FormLabel>Conditions</FormLabel>
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
          Add Condition
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          <strong>Warning:</strong> Non-default tiers require at least one
          condition. This tier will fail validation.
        </div>
      )}

      {fields.map((condition, conditionIndex) => {
        const isUsageCondition = "usageDetailPattern" in condition;
        const source = isUsageCondition ? "usage_details" : condition.source;

        return (
          <div key={condition.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                Condition {conditionIndex + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(conditionIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <FormItem>
              <FormLabel>Source</FormLabel>
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
                  <SelectItem value="usage_details">Usage details</SelectItem>
                  <SelectItem value="model_parameters">
                    Model parameters
                  </SelectItem>
                  <SelectItem value="metadata">Metadata</SelectItem>
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
                      ? "Usage detail key pattern (Regex)"
                      : "Top-level key"}
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
                      ? "Match and sum usage keys such as input or cached tokens."
                      : "Match this key exactly; nested paths are not supported."}
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
                      <FormLabel>Operator</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gt">
                            &gt; (greater than)
                          </SelectItem>
                          <SelectItem value="gte">
                            &gt;= (greater or equal)
                          </SelectItem>
                          <SelectItem value="lt">&lt; (less than)</SelectItem>
                          <SelectItem value="lte">
                            &lt;= (less or equal)
                          </SelectItem>
                          <SelectItem value="eq">= (equals)</SelectItem>
                          <SelectItem value="neq">!= (not equals)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormItem>
                  <FormLabel>Operator</FormLabel>
                  <Input disabled value="in (any of)" />
                </FormItem>
              )}

              <FormField
                control={form.control}
                name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.${isUsageCondition ? "value" : "values"}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isUsageCondition ? "Value" : "Values"}
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
                        Comma-separated exact values. All other tier conditions
                        still apply.
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
                    <FormLabel className="mt-0!">Case sensitive</FormLabel>
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
