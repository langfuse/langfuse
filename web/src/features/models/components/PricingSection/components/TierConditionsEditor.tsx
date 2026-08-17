import { PlusCircle, Trash2 } from "lucide-react";
import { useFieldArray } from "react-hook-form";
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
import type { UseFormReturn } from "react-hook-form";
import type { FormUpsertModel } from "@/src/features/models/validation";
import type { PricingTierFilterCondition } from "@langfuse/shared";

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
    condition: PricingTierFilterCondition,
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
              column: "usage_details",
              type: "numberObject",
              key: "",
              operator: ">",
              value: 0,
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

      {fields.map((condition, conditionIndex) => (
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

          <FormField
            control={form.control}
            name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.column`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(column) => {
                    if (column === "usage_details") {
                      replaceCondition(conditionIndex, {
                        column,
                        type: "numberObject",
                        key: "",
                        operator: ">",
                        value: 0,
                      });
                    } else {
                      replaceCondition(conditionIndex, {
                        column: column as "model_parameters" | "metadata",
                        type: "stringObject",
                        key: "",
                        operator: "=",
                        value: "",
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
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.key`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {condition.column === "usage_details"
                    ? "Usage detail key pattern (Regex)"
                    : "Top-level key"}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={
                      condition.column === "usage_details"
                        ? "^input"
                        : condition.column === "model_parameters"
                          ? "service_tier"
                          : "model_provider"
                    }
                  />
                </FormControl>
                <FormDescription>
                  {condition.column === "usage_details"
                    ? "Match and sum usage keys such as input or cached tokens."
                    : "Match this key exactly; nested paths are not supported."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Operator + Value */}
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.operator`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operator</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {condition.column === "usage_details" ? (
                        <>
                          <SelectItem value=">">&gt; (greater than)</SelectItem>
                          <SelectItem value=">=">
                            &gt;= (greater or equal)
                          </SelectItem>
                          <SelectItem value="<">&lt; (less than)</SelectItem>
                          <SelectItem value="<=">
                            &lt;= (less or equal)
                          </SelectItem>
                          <SelectItem value="=">= (equals)</SelectItem>
                          <SelectItem value="<>">!= (not equals)</SelectItem>
                        </>
                      ) : (
                        <SelectItem value="=">= (equals)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`pricingTiers.${tierIndex}.conditions.${conditionIndex}.value`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input
                      type={
                        condition.column === "usage_details" ? "number" : "text"
                      }
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          condition.column === "usage_details"
                            ? parseFloat(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {condition.column === "usage_details" && (
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
      ))}
    </div>
  );
}
