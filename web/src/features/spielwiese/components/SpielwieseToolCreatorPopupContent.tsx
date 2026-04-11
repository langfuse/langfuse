"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

const requestMethodItems = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
] as const;

const parameterRows = [
  {
    description: "City and state, e.g. San Francisco, CA",
    kind: "string",
    name: "location",
    required: true,
  },
  {
    description: "celsius, fahrenheit",
    kind: "enum",
    name: "unit",
    required: false,
  },
] as const;

export type ToolCreatorMode = "builder" | "json";

function ToolCreatorLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium">{children}</p>;
}

function ToolCreatorField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <ToolCreatorLabel>{label}</ToolCreatorLabel>
      {children}
    </label>
  );
}

function ToolCreatorParameterRow({
  description,
  kind,
  name,
  required,
}: {
  description: string;
  kind: string;
  name: string;
  required: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium">{name}</p>
          {required ? (
            <span className="text-muted-foreground text-xs">required</span>
          ) : null}
          <span className="text-muted-foreground text-xs">{kind}</span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <Button size="icon-sm" type="button" variant="ghost">
        <Ellipsis />
      </Button>
    </div>
  );
}

function ToolCreatorParameterList() {
  return (
    <div className="overflow-hidden rounded-lg border">
      {parameterRows.map((parameter, index) => (
        <div className={index === 0 ? "" : "border-t"} key={parameter.name}>
          <ToolCreatorParameterRow {...parameter} />
        </div>
      ))}
      <div className="border-t px-3 py-2">
        <Button size="sm" type="button" variant="ghost">
          + Add parameter
        </Button>
      </div>
    </div>
  );
}

function ToolCreatorEndpointSection({
  isExpanded,
  method,
  onExpandedChange,
  onMethodChange,
}: {
  isExpanded: boolean;
  method: string;
  onExpandedChange: (value: boolean) => void;
  onMethodChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        {isExpanded ? <ChevronDown /> : <ChevronRight />}
        Connect to endpoint
      </Button>
      {isExpanded ? (
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <Select
              items={requestMethodItems}
              name="tool-method"
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onMethodChange(value);
                }
              }}
              value={method}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" sideOffset={8}>
                <SelectGroup>
                  {requestMethodItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input defaultValue="https://api.example.com/weather" />
          </div>
          <Input defaultValue="Authorization header (optional)" />
        </div>
      ) : null}
    </div>
  );
}

function ToolCreatorBuilderBody() {
  const [isEndpointExpanded, setIsEndpointExpanded] = useState(true);
  const [method, setMethod] = useState("GET");

  return (
    <div className="flex flex-col gap-4">
      <ToolCreatorField label="Name">
        <Input defaultValue="get_weather" />
      </ToolCreatorField>
      <ToolCreatorField label="Description">
        <Textarea
          defaultValue="Get the current weather for a given location"
          rows={2}
        />
      </ToolCreatorField>
      <div className="flex flex-col gap-1.5">
        <ToolCreatorLabel>Parameters</ToolCreatorLabel>
        <ToolCreatorParameterList />
      </div>
      <ToolCreatorEndpointSection
        isExpanded={isEndpointExpanded}
        method={method}
        onExpandedChange={setIsEndpointExpanded}
        onMethodChange={setMethod}
      />
    </div>
  );
}

function ToolCreatorJsonBody() {
  return (
    <div className="flex flex-col gap-1.5">
      <ToolCreatorLabel>Schema</ToolCreatorLabel>
      <Textarea
        defaultValue={`{
  "name": "get_weather",
  "description": "Get the current weather for a given location",
  "parameters": {
    "location": { "type": "string", "required": true },
    "unit": { "type": "enum", "values": ["celsius", "fahrenheit"] }
  }
}`}
        className="min-h-[20rem]"
        rows={12}
      />
    </div>
  );
}

export function SpielwieseToolCreatorPopupContent({
  mode,
}: {
  mode: ToolCreatorMode;
}) {
  return mode === "builder" ? (
    <ToolCreatorBuilderBody />
  ) : (
    <ToolCreatorJsonBody />
  );
}
