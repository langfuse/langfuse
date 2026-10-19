import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const providers = Object.keys(providerLabels) as GatewayProvider[];

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
          {providers.map((provider) => {
            const ProviderIcon = providerIcons[provider];
            return (
              <SelectItem key={provider} value={provider}>
                <span className="flex items-center gap-2">
                  <span className="bg-background flex size-6 shrink-0 items-center justify-center rounded-md border">
                    <ProviderIcon aria-hidden className="icon-sm" />
                  </span>
                  {providerLabels[provider]}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
