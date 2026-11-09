import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type ConnectionFilterProps = {
  connections: ReadonlyArray<{
    id: string;
    name: string;
    provider: GatewayProvider;
  }>;
  value: string;
  onChange: (connectionId: string) => void;
};

export function ConnectionFilter({
  connections,
  value,
  onChange,
}: ConnectionFilterProps) {
  return (
    <div className="w-56 max-w-full">
      <SelectInput
        aria-label="Provider"
        placeholder="Select a provider"
        value={value}
        options={connections.map((connection) => ({
          value: connection.id,
          label: connection.name,
          icon: providerIcons[connection.provider],
        }))}
        onValueChange={onChange}
      />
    </div>
  );
}
