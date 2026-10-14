import { Label } from "@/src/app/design-system/legacy-primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/app/design-system/legacy-primitives/select";
import { providerLabels } from "@/src/ai/gateway/management-ui/constants/providerLabels";
import type { GatewayProvider } from "@/src/ai/gateway/management-ui/types/gatewayProvider";

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
          {Object.entries(providerLabels).map(([provider, label]) => (
            <SelectItem key={provider} value={provider}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
