"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

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
              className="focus-visible:ring-ring data-[state=checked]:border-primary-accent data-[state=checked]:bg-primary-accent/5 data-[state=checked]:ring-primary-accent data-[state=unchecked]:hover:bg-muted/50 flex min-w-0 items-center gap-3 rounded-md border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden data-[state=checked]:ring-1"
            >
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md border">
                <ProviderIcon aria-hidden size="lg" />
              </span>
              <span className="min-w-0 text-sm leading-tight font-bold">
                {providerLabels[provider]}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
