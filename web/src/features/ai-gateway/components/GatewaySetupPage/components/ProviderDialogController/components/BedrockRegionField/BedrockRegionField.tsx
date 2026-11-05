import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Label } from "@/src/components/ui/label";
import { bedrockRegions } from "@/src/features/ai-gateway/constants/bedrockRegions";

const regionOptions = bedrockRegions.map((region) => ({
  value: region.value,
  label: `${region.value} · ${region.label}`,
}));

export type BedrockRegionFieldProps = {
  value: string;
  onChange: (region: string) => void;
};

export function BedrockRegionField({
  value,
  onChange,
}: BedrockRegionFieldProps) {
  return (
    <div>
      <Label htmlFor="gateway-bedrock-region">AWS region</Label>
      <div className="mt-1.5">
        <SelectInput
          id="gateway-bedrock-region"
          value={value}
          options={regionOptions}
          onValueChange={onChange}
          placeholder="Select a region"
          search={{ placeholder: "Search regions..." }}
          emptyMessage="No matching region"
        />
      </div>
    </div>
  );
}
