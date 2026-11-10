import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Label } from "@/src/components/ui/label";
import {
  apiKeyExpirationOptions,
  type ApiKeyExpirationPreset,
} from "@/src/features/apiKey/constants/apiKeyExpirationOptions";
import { localDateInputValue } from "@/src/features/apiKey/fns/localDateInputValue";

type ApiKeyExpirationInputProps = {
  id: string;
  expiryPreset: ApiKeyExpirationPreset;
  customExpiry: string;
  onExpiryPresetChange: (value: ApiKeyExpirationPreset) => void;
  onCustomExpiryChange: (value: string) => void;
};

export function ApiKeyExpirationInput({
  id,
  expiryPreset,
  customExpiry,
  onExpiryPresetChange,
  onCustomExpiryChange,
}: ApiKeyExpirationInputProps) {
  const handleCustomExpiryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCustomExpiryChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Expiration</Label>
      <div className="flex gap-2">
        <SelectInput
          id={id}
          value={expiryPreset}
          options={apiKeyExpirationOptions}
          placeholder="Select expiration"
          onValueChange={onExpiryPresetChange}
        />
        {expiryPreset === "custom" ? (
          <Input
            type="date"
            aria-label="Custom expiration date"
            min={localDateInputValue(new Date())}
            value={customExpiry}
            onChange={handleCustomExpiryChange}
          />
        ) : null}
      </div>
    </div>
  );
}
