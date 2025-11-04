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
  /**
   * Label for the form field
   */
  label: string;
  /**
   * Optional description shown below the label
   */
  description?: string;
  /**
   * Current schema value (JSON string)
   */
  value: string;
  /**
   * Callback when schema changes
   */
  onChange: (value: string) => void;
  /**
   * Whether the input is disabled
   */
  disabled?: boolean;
};

/**
 * Dataset-specific JSON Schema input with enable/disable toggle
 * Wraps the reusable JSONSchemaEditor component
 */
export const DatasetSchemaInput: React.FC<DatasetSchemaInputProps> = ({
  label,
  description,
  value,
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
        JSON.stringify(
          {
            type: "object",
            properties: {},
            required: [],
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
            minHeight={150}
            className="max-h-[25vh]"
          />
        </FormControl>
      )}

      <FormMessage />
    </FormItem>
  );
};
