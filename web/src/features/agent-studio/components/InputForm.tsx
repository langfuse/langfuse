import React, { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

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

// Serialise array value to/from JSON string stored in `values`
function parseArrayValue(raw: string | undefined): string[] {
  if (!raw || raw === "[]") return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function ArrayInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const items = parseArrayValue(value);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange(JSON.stringify([...items, v]));
    setDraft("");
    inputRef.current?.focus();
  };

  const remove = (idx: number) => {
    onChange(JSON.stringify(items.filter((_, i) => i !== idx)));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1 pr-1 font-mono text-xs"
            >
              {item.length > 24 ? item.slice(0, 22) + "…" : item}
              <button
                type="button"
                onClick={() => remove(i)}
                className="hover:text-destructive rounded"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex h-9 items-stretch gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "Add item and press + or Enter…"}
          className="h-9 flex-1 font-mono text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={add}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function extractInputSchema(
  schema: Record<string, unknown>,
): JsonSchema | null {
  // LangGraph returns { input_schema: {...} } (v0.9+) or { input: {...} } (older)
  const input = (schema.input_schema ?? schema.input) as JsonSchema | undefined;
  if (input?.properties) return input;
  return null;
}

export function InputForm({ schema, isLoading, values, onChange }: Props) {
  const [jsonFallback, setJsonFallback] = useState(false);
  const [rawJson, setRawJson] = useState("{}");

  // Pre-fill array fields with "[]" on first schema load
  useEffect(() => {
    if (!schema) return;
    const inputSchema = extractInputSchema(schema);
    if (!inputSchema?.properties) return;
    const defaults: Record<string, string> = {};
    for (const [key, fieldSchema] of Object.entries(inputSchema.properties)) {
      if ((fieldSchema as { type?: string }).type === "array" && !values[key]) {
        defaults[key] = "[]";
      }
    }
    if (Object.keys(defaults).length > 0) {
      onChange({ ...values, ...defaults });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

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
          className="bg-background min-h-[80px] w-full rounded-md border px-3 py-2 font-mono text-sm"
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value) as Record<
                string,
                string
              >;
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
          className="bg-background min-h-[80px] w-full rounded-md border px-3 py-2 font-mono text-sm"
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value) as Record<
                string,
                string
              >;
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
            className="text-muted-foreground text-xs underline"
            onClick={() => setJsonFallback(false)}
          >
            Switch to form
          </button>
        </div>
        <textarea
          className="bg-background min-h-[80px] w-full rounded-md border px-3 py-2 font-mono text-sm"
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`field-${key}`}>{fieldSchema.title ?? key}</Label>
            {inputSchema.required?.includes(key) ? (
              <span className="text-destructive text-xs font-medium">
                required
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">optional</span>
            )}
          </div>
          {fieldSchema.description && (
            <p className="text-muted-foreground text-xs">
              {fieldSchema.description}
            </p>
          )}
          {fieldSchema.type === "array" ? (
            <ArrayInput
              value={values[key] ?? "[]"}
              onChange={(v) => onChange({ ...values, [key]: v })}
              placeholder={`Add ${key} and press + or Enter…`}
            />
          ) : (
            <Input
              id={`field-${key}`}
              value={values[key] ?? ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={
                fieldSchema.default !== undefined
                  ? String(fieldSchema.default)
                  : `Enter ${key}…`
              }
            />
          )}
        </div>
      ))}
      <button
        className="text-muted-foreground self-start text-xs underline"
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
