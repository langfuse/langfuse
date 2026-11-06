import type { ChangeEvent } from "react";
import { PlusIcon, TrashIcon } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { Label } from "@/src/components/ui/label";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import {
  CUSTOM_PROVIDER_API_FORMATS_ERROR,
  CUSTOM_PROVIDER_MAX_API_FORMATS,
  customProviderApiFormatOptions,
} from "@/src/features/ai-gateway/constants/customProviderApiFormats";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

export type ExtraHeaderRow = { id: string; key: string; value: string };

export function CustomProviderFields({
  baseURL,
  apiFormats,
  headers,
  storedHeaderKeys,
  isEditing,
  onBaseURLChange,
  onApiFormatsChange,
  onHeadersChange,
}: {
  baseURL: string;
  apiFormats: GatewayApiFormat[];
  headers: ExtraHeaderRow[];
  /** Names whose values are stored; their rows may stay blank to keep the value. */
  storedHeaderKeys: string[];
  isEditing: boolean;
  onBaseURLChange: (baseURL: string) => void;
  onApiFormatsChange: (apiFormats: GatewayApiFormat[]) => void;
  onHeadersChange: (headers: ExtraHeaderRow[]) => void;
}) {
  const handleBaseURLChange = (event: ChangeEvent<HTMLInputElement>) => {
    onBaseURLChange(event.target.value);
  };

  return (
    <>
      <div>
        <FieldHeader
          label="API Base URL"
          htmlFor="gateway-base-url"
          description={
            <>
              Requests go to this URL followed by the endpoint path, for example
              /chat/completions.
              {isEditing ? " Changing it requires a new secret key." : null}
            </>
          }
        />
        <Input
          id="gateway-base-url"
          placeholder="https://llm-proxy.example.com/v1"
          value={baseURL}
          onChange={handleBaseURLChange}
        />
      </div>
      <ApiFormatsField value={apiFormats} onChange={onApiFormatsChange} />
      <ExtraHeadersField
        headers={headers}
        storedHeaderKeys={storedHeaderKeys}
        onChange={onHeadersChange}
      />
    </>
  );
}

function ApiFormatsField({
  value,
  onChange,
}: {
  value: GatewayApiFormat[];
  onChange: (apiFormats: GatewayApiFormat[]) => void;
}) {
  const isFull = value.length >= CUSTOM_PROVIDER_MAX_API_FORMATS;

  const handleCheckedChange = (apiFormat: GatewayApiFormat, checked: boolean) =>
    onChange(
      checked
        ? [...value, apiFormat]
        : value.filter((selected) => selected !== apiFormat),
    );

  return (
    <div role="group" aria-labelledby="gateway-api-formats">
      <FieldHeader
        label="Endpoints"
        id="gateway-api-formats"
        description={`The API formats the provider serves. Select up to ${CUSTOM_PROVIDER_MAX_API_FORMATS}.`}
      />
      <div className="space-y-2">
        {customProviderApiFormatOptions.map((option) => {
          const id = `gateway-api-format-${option.value}`;
          const checked = value.includes(option.value);
          return (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                disabled={!checked && isFull}
                onCheckedChange={(state) =>
                  handleCheckedChange(option.value, state === true)
                }
              />
              <Label htmlFor={id} className="font-normal">
                {option.label}{" "}
                <span className="text-muted-foreground">
                  ({option.format} format)
                </span>
              </Label>
            </div>
          );
        })}
      </div>
      {value.length === 0 ? (
        <p className="text-destructive mt-2 text-sm">
          {CUSTOM_PROVIDER_API_FORMATS_ERROR}
        </p>
      ) : null}
    </div>
  );
}

function ExtraHeadersField({
  headers,
  storedHeaderKeys,
  onChange,
}: {
  headers: ExtraHeaderRow[];
  storedHeaderKeys: string[];
  onChange: (headers: ExtraHeaderRow[]) => void;
}) {
  const handleAddHeader = () => {
    onChange([...headers, { id: crypto.randomUUID(), key: "", value: "" }]);
  };

  const handleHeaderChange = (
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    onChange(
      headers.map((header) =>
        header.id === id ? { ...header, [field]: value } : header,
      ),
    );
  };

  const handleRemoveHeader = (id: string) => {
    onChange(headers.filter((header) => header.id !== id));
  };

  return (
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
