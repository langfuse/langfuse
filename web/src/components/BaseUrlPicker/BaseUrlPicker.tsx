import { useState, type ChangeEvent, type Ref } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { findBaseUrlPreset } from "@/src/components/BaseUrlPicker/fns/findBaseUrlPreset";
import type { BaseUrlPreset } from "@/src/types/baseUrlPreset";

const CUSTOM_OPTION = "custom";
const CUSTOM_URL_OPTION = {
  value: CUSTOM_OPTION,
  label: "Custom URL",
  badges: [{ text: "Proxy or other endpoint", color: "outline" as const }],
};

export type BaseUrlPickerProps = {
  id?: string;
  presets: BaseUrlPreset[];
  value: string;
  onChange: (baseURL: string) => void;
  onBlur?: () => void;
  error?: boolean;
  disabled?: boolean;
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
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ref,
}: BaseUrlPickerProps) {
  const matchedPreset = findBaseUrlPreset(presets, value);
  // Custom stays selected until a preset is picked, so clearing or retyping a
  // custom URL never swaps the input out from under the user.
  const [isCustomSelected, setIsCustomSelected] = useState(
    () => !matchedPreset,
  );
  const isCustom = isCustomSelected || !matchedPreset;
  const options = [
    {
      type: "group" as const,
      id: "presets",
      label: "Regions",
      options: presets.map((preset) => ({
        value: preset.url,
        label: preset.label,
        badges: [{ text: preset.url, color: "filled" as const }],
      })),
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
        customOption={CUSTOM_URL_OPTION}
        onValueChange={handleOptionChange}
        placeholder="Select a base URL"
        noCapture
        disabled={disabled}
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
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          error={error}
          onChange={handleCustomURLChange}
          onBlur={onBlur}
        />
      ) : (
        <p
          title={matchedPreset.url}
          className="text-muted-foreground truncate px-3 font-mono text-xs"
        >
          {matchedPreset.url}
        </p>
      )}
    </div>
  );
}
