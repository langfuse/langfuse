import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { OPENROUTER_ENABLED } from "@/src/features/ai-gateway/constants/providerAvailability";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function ProviderSelect({
  value,
  onChange,
}: {
  value: GatewayProvider;
  onChange: (provider: GatewayProvider) => void;
}) {
  return (
    <div>
      <Label htmlFor="gateway-provider">Provider</Label>
      <Select
        value={value}
        onValueChange={(provider) => onChange(provider as GatewayProvider)}
      >
        <SelectTrigger id="gateway-provider" className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(providerLabels)
            .filter(
              ([provider]) => provider !== "OPENROUTER" || OPENROUTER_ENABLED,
            )
            .map(([provider, label]) => (
              <SelectItem key={provider} value={provider}>
                {label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
