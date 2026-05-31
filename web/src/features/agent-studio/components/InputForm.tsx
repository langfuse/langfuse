import React, { useEffect, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  title?: string;
  description?: string;
  default?: unknown;
};

type Props = {
  schema: Record<string, unknown> | undefined;
  isLoading: boolean;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
};

function extractInputSchema(schema: Record<string, unknown>): JsonSchema | null {
  // LangGraph returns { input: { properties: {...} }, output: ... }
  const input = schema.input as JsonSchema | undefined;
  if (input?.properties) return input;
  return null;
}

export function InputForm({ schema, isLoading, values, onChange }: Props) {
  const [jsonFallback, setJsonFallback] = useState(false);
  const [rawJson, setRawJson] = useState("{}");

  useEffect(() => {
    if (jsonFallback) {
      try {
        const parsed = JSON.parse(rawJson) as Record<string, string>;
        onChange(parsed);
      } catch {
        // ignore invalid JSON during editing
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawJson, jsonFallback]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Input (JSON)</Label>
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value) as Record<string, string>;
              onChange(parsed);
            } catch {
              // ignore invalid JSON during editing
            }
          }}
        />
      </div>
    );
  }

  const inputSchema = extractInputSchema(schema);
  if (!inputSchema || !inputSchema.properties) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Input (JSON)</Label>
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value) as Record<string, string>;
              onChange(parsed);
            } catch {
              // ignore invalid JSON during editing
            }
          }}
        />
      </div>
    );
  }

  const fields = Object.entries(inputSchema.properties);

  if (jsonFallback) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Input (JSON)</Label>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setJsonFallback(false)}
          >
            Switch to form
          </button>
        </div>
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map(([key, fieldSchema]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label htmlFor={`field-${key}`}>
            {fieldSchema.title ?? key}
            {inputSchema.required?.includes(key) && (
              <span className="ml-1 text-destructive">*</span>
            )}
          </Label>
          {fieldSchema.description && (
            <p className="text-xs text-muted-foreground">{fieldSchema.description}</p>
          )}
          <Input
            id={`field-${key}`}
            value={values[key] ?? ""}
            onChange={(e) =>
              onChange({ ...values, [key]: e.target.value })
            }
            placeholder={
              fieldSchema.default !== undefined
                ? String(fieldSchema.default)
                : `Enter ${key}…`
            }
          />
        </div>
      ))}
      <button
        className="self-start text-xs text-muted-foreground underline"
        onClick={() => {
          setRawJson(JSON.stringify(values, null, 2));
          setJsonFallback(true);
        }}
      >
        Edit as JSON
      </button>
    </div>
  );
}
