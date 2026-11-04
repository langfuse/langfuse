import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { Label } from "@/src/components/ui/label";

export type BedrockRegionFieldProps = {
  value: string;
  disabled: boolean;
  onChange: (region: string) => void;
};

export function BedrockRegionField({
  value,
  disabled,
  onChange,
}: BedrockRegionFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    onChange(event.target.value);

  return (
    <div>
      <Label htmlFor="gateway-bedrock-region">AWS region</Label>
      <div className="mt-1.5">
        <Input
          id="gateway-bedrock-region"
          placeholder="us-east-1"
          value={value}
          disabled={disabled}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
