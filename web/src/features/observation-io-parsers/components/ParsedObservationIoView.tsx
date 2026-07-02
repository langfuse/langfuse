import { useMemo } from "react";
import { type Prisma } from "@langfuse/shared";
import { type ViewMode } from "@/src/components/trace/components/IOPreview/IOPreview";
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";

type ParsedObservationIoField = {
  key: string;
  label: string;
  source: "input" | "output" | "metadata" | "conversation";
  value: unknown;
  status: "ok" | "miss" | "error";
  error?: string;
};

type ParsedObservationIoForView = {
  observationId: string;
  fields: ParsedObservationIoField[];
};

export type ParsedObservationIoPreview = {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
};

type ParsedObservationIoPreviewSection = keyof ParsedObservationIoPreview;

const sanitizeJsonValue = (value: unknown): Prisma.JsonValue => {
  if (value === undefined) return null;
  if (value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, sanitizeJsonValue(fieldValue)]),
    ) as Prisma.JsonObject;
  }

  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatMessageLike = (value: unknown): boolean => {
  if (!isRecord(value) || typeof value.role !== "string") return false;

  return (
    "content" in value ||
    "tool_calls" in value ||
    "tool_call_id" in value ||
    "json" in value
  );
};

const isChatMessagesLike = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(isChatMessageLike);

const getParsedFieldPreviewValue = (
  field: ParsedObservationIoField,
): Prisma.JsonValue => {
  if (field.status === "ok") {
    return sanitizeJsonValue(field.value);
  }

  if (field.status === "miss") {
    return null;
  }

  return { error: field.error ?? "Parse error" };
};

const getUniquePreviewKey = (
  field: ParsedObservationIoField,
  usedKeys: Set<string>,
) => {
  const baseKey = field.label.trim() || field.key;

  if (!usedKeys.has(baseKey)) {
    usedKeys.add(baseKey);
    return baseKey;
  }

  let suffix = 2;
  let key = `${baseKey} (${suffix})`;

  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${baseKey} (${suffix})`;
  }

  usedKeys.add(key);
  return key;
};

export const getParsedObservationIoPreview = (
  parsedObservationIo: ParsedObservationIoForView,
): ParsedObservationIoPreview => {
  const onlyField = parsedObservationIo.fields[0];
  if (
    parsedObservationIo.fields.length === 1 &&
    onlyField?.status === "ok" &&
    onlyField.source !== "metadata"
  ) {
    const value = getParsedFieldPreviewValue(onlyField);
    if (isChatMessageLike(value) || isChatMessagesLike(value)) {
      return onlyField.source === "input"
        ? { input: value }
        : { output: value };
    }
  }

  const sections = {
    input: {} as Record<string, Prisma.JsonValue>,
    output: {} as Record<string, Prisma.JsonValue>,
    metadata: {} as Record<string, Prisma.JsonValue>,
  };
  const usedKeys = {
    input: new Set<string>(),
    output: new Set<string>(),
    metadata: new Set<string>(),
  };
  const getPreviewSection = (
    field: ParsedObservationIoField,
  ): ParsedObservationIoPreviewSection => {
    if (field.source === "metadata") return "metadata";
    if (field.source === "input") return "input";
    return "output";
  };

  parsedObservationIo.fields.forEach((field) => {
    const section = getPreviewSection(field);
    sections[section][getUniquePreviewKey(field, usedKeys[section])] =
      getParsedFieldPreviewValue(field);
  });

  return {
    input: Object.keys(sections.input).length > 0 ? sections.input : undefined,
    output:
      Object.keys(sections.output).length > 0 ? sections.output : undefined,
    metadata:
      Object.keys(sections.metadata).length > 0 ? sections.metadata : undefined,
  };
};

export function ParsedObservationIoView({
  parsedObservationIo,
  projectId,
  traceId,
  currentView = "pretty",
}: {
  parsedObservationIo: ParsedObservationIoForView;
  projectId: string;
  traceId: string;
  currentView?: Extract<ViewMode, "pretty" | "json">;
}) {
  const preview = useMemo(
    () => getParsedObservationIoPreview(parsedObservationIo),
    [parsedObservationIo],
  );

  return (
    <IOPreview
      key={parsedObservationIo.observationId}
      input={preview.input}
      output={preview.output}
      metadata={preview.metadata}
      parsedInput={preview.input}
      parsedOutput={preview.output}
      parsedMetadata={preview.metadata}
      isLoading={false}
      isParsing={false}
      hideIfNull
      media={[]}
      currentView={currentView}
      showMetadata
      observationId={parsedObservationIo.observationId}
      projectId={projectId}
      traceId={traceId}
      showCorrections={false}
    />
  );
}
