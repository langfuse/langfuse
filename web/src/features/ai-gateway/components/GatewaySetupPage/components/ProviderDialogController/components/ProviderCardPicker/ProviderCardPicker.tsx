"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "@langfuse/icons";

import { Label } from "@/src/components/ui/label";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const providers = Object.keys(providerLabels) as GatewayProvider[];

export type ProviderCardPickerProps = {
  value: GatewayProvider;
  onChange: (provider: GatewayProvider) => void;
};

/**
 * Picks the provider of a new connection. Each card is a radio item, so arrow
 * keys move the selection and the group reads as one field.
 */
export function ProviderCardPicker({
  value,
  onChange,
}: ProviderCardPickerProps) {
  const handleValueChange = (next: string) => {
    const provider = providers.find((candidate) => candidate === next);
    if (provider) onChange(provider);
  };

  return (
    <div>
      <Label id="gateway-provider-label">Provider</Label>
      <RadioGroupPrimitive.Root
        aria-labelledby="gateway-provider-label"
        value={value}
        onValueChange={handleValueChange}
        className="mt-1.5 grid grid-cols-3 gap-2"
      >
        {providers.map((provider) => {
          const ProviderIcon = providerIcons[provider];
          return (
            <RadioGroupPrimitive.Item
              key={provider}
              value={provider}
              className="focus-visible:ring-ring data-[state=checked]:border-foreground data-[state=checked]:ring-foreground data-[state=unchecked]:hover:bg-muted/50 relative flex min-w-0 flex-col items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus:outline-hidden focus-visible:ring-2 data-[state=checked]:ring-1"
            >
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md border">
                <ProviderIcon aria-hidden size="lg" />
              </span>
              <span className="text-sm font-bold">
                {providerLabels[provider]}
              </span>
              <RadioGroupPrimitive.Indicator className="bg-foreground text-background absolute top-2 right-2 flex size-4 items-center justify-center rounded-full">
                <Check size="sm" aria-hidden />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
