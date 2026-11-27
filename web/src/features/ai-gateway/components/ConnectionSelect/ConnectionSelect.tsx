import type { ComponentProps } from "react";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type ConnectionSelectOption = {
  id: string;
  name: string;
  provider: GatewayProvider;
};

export type ConnectionSelectProps = {
  connections: ReadonlyArray<ConnectionSelectOption>;
  value: string;
  onChange: (connectionId: string) => void;
} & Pick<
  ComponentProps<typeof SelectInput>,
  "id" | "aria-describedby" | "aria-label" | "placeholder" | "disabled"
>;

export function ConnectionSelect({
  connections,
  onChange,
  ...selectProps
}: ConnectionSelectProps) {
  return (
    <div className="ph-no-capture">
      <SelectInput
        {...selectProps}
        noCapture
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
