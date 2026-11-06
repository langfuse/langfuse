import { useState, type ChangeEvent } from "react";
import { PlusIcon, TrashIcon } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import type { GatewayApiFamily } from "@/src/features/ai-gateway/types/gatewayProvider";

export type ExtraHeaderRow = { id: string; key: string; value: string };

const defaultBaseUrls: Record<GatewayApiFamily, string> = {
  OPENAI: "OpenAI default: https://api.openai.com/v1",
  ANTHROPIC:
    "Anthropic default: https://api.anthropic.com (excluding /v1/messages)",
};

export function AdvancedSettings({
  provider,
  baseURL,
  headers,
  storedHeaderKeys,
  isEditing,
  onBaseURLChange,
  onHeadersChange,
}: {
  provider: GatewayApiFamily;
  baseURL: string;
  headers: ExtraHeaderRow[];
  /** Names whose values are stored; their rows may stay blank to keep the value. */
  storedHeaderKeys: string[];
  isEditing: boolean;
  onBaseURLChange: (baseURL: string) => void;
  onHeadersChange: (headers: ExtraHeaderRow[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBaseURLChange = (event: ChangeEvent<HTMLInputElement>) => {
    onBaseURLChange(event.target.value);
  };

  const handleAddHeader = () => {
    onHeadersChange([
      ...headers,
      { id: crypto.randomUUID(), key: "", value: "" },
    ]);
  };

  const handleHeaderChange = (
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    onHeadersChange(
      headers.map((header) =>
        header.id === id ? { ...header, [field]: value } : header,
      ),
    );
  };

  const handleRemoveHeader = (id: string) => {
    onHeadersChange(headers.filter((header) => header.id !== id));
  };

  return (
    <div className="space-y-6">
      <ExpandToggle
        expanded={isExpanded}
        onExpandedChange={setIsExpanded}
        label="Show advanced settings"
        expandedLabel="Hide advanced settings"
        variant="icon"
        iconPosition="right"
        size="sm"
        controls="gateway-advanced-settings"
      />
      {isExpanded ? (
        <div id="gateway-advanced-settings" className="space-y-6 border-t pt-6">
          <div>
            <FieldHeader
              label="API Base URL"
              htmlFor="gateway-base-url"
              description={
                <>
                  Leave blank to use the default base URL.{" "}
                  {isEditing ? "Changing it requires a new secret key. " : null}
                  {defaultBaseUrls[provider]}
                </>
              }
            />
            <Input
              id="gateway-base-url"
              placeholder="default"
              value={baseURL}
              onChange={handleBaseURLChange}
            />
          </div>
          <div
            role="group"
            aria-labelledby="gateway-extra-headers"
            className="ph-no-capture space-y-2"
          >
            <FieldHeader
              label="Extra Headers"
              id="gateway-extra-headers"
              description="Optional HTTP headers sent with every request to the provider. Header values are stored encrypted."
            />
            {headers.map((header) => (
              <ExtraHeaderField
                key={header.id}
                header={header}
                isStored={storedHeaderKeys.includes(header.key)}
                onChange={handleHeaderChange}
                onRemove={handleRemoveHeader}
              />
            ))}
            {/* Offsets the ghost padding so the icon lines up with the inputs. */}
            <div className="-ml-3">
              <Button
                variant="ghost"
                icon={PlusIcon}
                text="Add Header"
                onClick={handleAddHeader}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExtraHeaderField({
  header,
  isStored,
  onChange,
  onRemove,
}: {
  header: ExtraHeaderRow;
  isStored: boolean;
  onChange: (id: string, field: "key" | "value", value: string) => void;
  onRemove: (id: string) => void;
}) {
  const handleKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(header.id, "key", event.target.value);
  };

  const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(header.id, "value", event.target.value);
  };

  const handleRemove = () => {
    onRemove(header.id);
  };

  return (
    <div className="flex flex-row gap-2">
      <Input
        aria-label="Header name"
        placeholder="Header name"
        value={header.key}
        onChange={handleKeyChange}
      />
      <Input
        aria-label="Header value"
        type="password"
        autoComplete="new-password"
        placeholder={isStored ? "***" : "Header value"}
        value={header.value}
        onChange={handleValueChange}
      />
      <IconButton
        icon={TrashIcon}
        label="Remove header"
        onClick={handleRemove}
      />
    </div>
  );
}
