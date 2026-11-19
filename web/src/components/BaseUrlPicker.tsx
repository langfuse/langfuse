import { useState, type ChangeEvent, type Ref } from "react";
import { PlusIcon } from "@langfuse/icons";

import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { findBaseUrlPreset } from "@/src/fns/findBaseUrlPreset";
import type { BaseUrlPreset } from "@/src/types/baseUrlPreset";

const CUSTOM_OPTION = "custom";

export type BaseUrlPickerProps = {
  id?: string;
  presets: BaseUrlPreset[];
  value: string;
  onChange: (baseURL: string) => void;
  onBlur?: () => void;
  error?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/** Picks a well-known base URL, or falls back to a free-text custom URL. */
export function BaseUrlPicker({
  id,
  presets,
  value,
  onChange,
  onBlur,
  error,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ref,
}: BaseUrlPickerProps) {
  const matchedPreset = findBaseUrlPreset(presets, value);
  // Stays on Custom once chosen, even while the typed URL equals a preset.
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  const isCustom = isCustomSelected || !matchedPreset;
  const options = [
    ...presets.map((preset) => ({
      value: preset.url,
      label: preset.label,
      badges: [{ text: preset.url, color: "filled" as const }],
    })),
    {
      value: CUSTOM_OPTION,
      label: "Custom URL",
      icon: PlusIcon,
      badges: [{ text: "Proxy or other endpoint", color: "outline" as const }],
    },
  ];

  const handleOptionChange = (option: string) => {
    if (option === CUSTOM_OPTION) {
      setIsCustomSelected(true);
      return;
    }
    const preset = presets.find((candidate) => candidate.url === option);
    if (!preset) return;
    setIsCustomSelected(false);
    onChange(preset.isDefault ? "" : preset.url);
  };

  const handleCustomURLChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-2">
      <SelectInput
        id={id}
        value={isCustom ? CUSTOM_OPTION : matchedPreset.url}
        options={options}
        onValueChange={handleOptionChange}
        placeholder="Select a base URL"
        noCapture
        aria-describedby={ariaDescribedBy}
        aria-invalid={!isCustom && ariaInvalid}
        error={!isCustom && error}
        onBlur={onBlur}
      />
      {isCustom ? (
        <Input
          ref={ref}
          aria-label="Custom base URL"
          placeholder="https://proxy.example.com/v1"
          value={value}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          error={error}
          onChange={handleCustomURLChange}
          onBlur={onBlur}
        />
      ) : null}
    </div>
  );
}
