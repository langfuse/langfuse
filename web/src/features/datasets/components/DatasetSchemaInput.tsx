import React, { useState } from "react";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Switch } from "@/src/components/ui/switch";
import { JSONSchemaEditor } from "@/src/components/JSONSchemaEditor";

type DatasetSchemaInputProps = {
  label: string;
  description?: string;
  value: string;
  initialValue?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export const DatasetSchemaInput: React.FC<DatasetSchemaInputProps> = ({
  label,
  description,
  value,
  initialValue,
  onChange,
  disabled = false,
}) => {
  // Track if schema enforcement is enabled based on whether value is empty
  const [isEnabled, setIsEnabled] = useState(value !== "");

  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    if (!checked) {
      // Clear schema when disabling
      onChange("");
    } else if (value === "") {
      // Set default empty schema when enabling
      onChange(
        initialValue ||
          JSON.stringify(
            {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
            null,
            2,
          ),
      );
    }
  };

  return (
    <FormItem>
      <div className="flex items-center justify-between">
        <FormLabel>{label}</FormLabel>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={disabled}
          />
        </div>
      </div>

      {description && <FormDescription>{description}</FormDescription>}

      {isEnabled && (
        <FormControl>
          <JSONSchemaEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="max-h-[25vh]"
          />
        </FormControl>
      )}

      <FormMessage />
    </FormItem>
  );
};
