import { Button } from "@/src/components/ui/button";
import { FormDescription } from "@/src/components/ui/form";
import type { UseFormReturn } from "react-hook-form";
import type { FormUpsertModel } from "../../validation";

type TierPrefillButtonsProps = {
  tierIndex: number;
  form: UseFormReturn<FormUpsertModel>;
};

export type { TierPrefillButtonsProps };

export function TierPrefillButtons({
  tierIndex,
  form,
}: TierPrefillButtonsProps) {
  const prices = form.watch(`pricingTiers.${tierIndex}.prices`) || {};

  return (
    <div className="space-y-2">
      <FormDescription>Prefill usage types from template:</FormDescription>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            form.setValue(`pricingTiers.${tierIndex}.prices`, {
              input: 0,
              output: 0,
              input_cached_tokens: 0,
              output_reasoning_tokens: 0,
              ...prices,
            });
          }}
        >
          OpenAI
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            form.setValue(`pricingTiers.${tierIndex}.prices`, {
              input: 0,
              input_tokens: 0,
              output: 0,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              ...prices,
            });
          }}
        >
          Anthropic
        </Button>
      </div>
    </div>
  );
}
