import { VisibilityConditionStrictSchema } from "@json-render/core";
import { z } from "zod";
import { customUiCatalog } from "./catalogDefinition";
import { isAllowedComputedFunction } from "./bindings";

export const CUSTOM_UI_SPEC_LIMITS = {
  maxBytes: 64 * 1_024,
  maxDepth: 10,
  maxNodes: 200,
  maxRepeatItems: 100,
} as const;

const JsonPointerSchema = z
  .string()
  .max(500)
  .refine((value) => value === "" || value.startsWith("/"), {
    message: "Bindings must use RFC 6901 JSON Pointer paths",
  });

const RepeatSchema = z
  .object({
    statePath: JsonPointerSchema,
    key: z.string().max(160).optional(),
  })
  .strict();

const CustomUiElementSchema = z
  .object({
    type: z.enum(customUiCatalog.componentNames as [string, ...string[]]),
    props: z.record(z.string(), z.unknown()),
    children: z.array(z.string().min(1).max(160)).max(200),
    slots: z
      .record(z.string().min(1).max(80), z.array(z.string().min(1).max(160)))
      .optional(),
    visible: VisibilityConditionStrictSchema.optional(),
    repeat: RepeatSchema.optional(),
  })
  .strict();

/** The persisted, action-free json-render specification for a Custom UI. */
export const CustomUiSpecSchema = z
  .object({
    root: z.string().min(1).max(160),
    elements: z.record(z.string().min(1).max(160), CustomUiElementSchema),
  })
  .strict();

export type CustomUiSpec = z.infer<typeof CustomUiSpecSchema>;
export type CustomUiElement = z.infer<typeof CustomUiElementSchema>;

export const CustomUiRenderInputSchema = z
  .object({
    envelopeVersion: z.literal("1"),
    data: z.record(z.string(), z.unknown()),
    meta: z
      .object({
        surface: z.enum(["SESSION", "TRACE"]),
        source: z.enum(["TRACE", "OBSERVATION_INPUT", "OBSERVATION_OUTPUT"]),
      })
      .strict(),
    scores: z
      .array(
        z
          .object({
            name: z.string().max(200),
            value: z.union([z.number(), z.string(), z.boolean()]),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export type CustomUiRenderInput = z.infer<typeof CustomUiRenderInputSchema>;

export type CustomUiSpecFailureCode =
  | "INVALID_SHAPE"
  | "INVALID_CATALOG"
  | "DISALLOWED_EXPRESSION"
  | "TOO_LARGE";

export type CustomUiSpecValidationResult =
  | { success: true; spec: CustomUiSpec; byteLength: number }
  | { success: false; code: CustomUiSpecFailureCode };

const byteLength = (value: unknown): number | undefined => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return undefined;
  }
};

const hasSafeExpressions = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(hasSafeExpressions);
  if (!value || typeof value !== "object") return true;

  const record = value as Record<string, unknown>;
  const expressionKeys = Object.keys(record).filter((key) =>
    key.startsWith("$"),
  );
  if (expressionKeys.length === 0) {
    return Object.values(record).every(hasSafeExpressions);
  }

  if ("$bindState" in record || "$bindItem" in record) return false;
  if ("$state" in record) {
    return (
      Object.keys(record).length === 1 &&
      JsonPointerSchema.safeParse(record.$state).success
    );
  }
  if ("$item" in record) {
    return (
      Object.keys(record).length === 1 &&
      typeof record.$item === "string" &&
      record.$item.length <= 500
    );
  }
  if ("$index" in record) {
    return Object.keys(record).length === 1 && record.$index === true;
  }
  if ("$template" in record) {
    return (
      Object.keys(record).length === 1 &&
      typeof record.$template === "string" &&
      record.$template.length <= 4_000
    );
  }
  if ("$computed" in record) {
    return (
      Object.keys(record).every(
        (key) => key === "$computed" || key === "args",
      ) &&
      isAllowedComputedFunction(record.$computed) &&
      (record.args === undefined || hasSafeExpressions(record.args))
    );
  }
  if ("$cond" in record) {
    return (
      Object.keys(record).every((key) =>
        ["$cond", "$then", "$else"].includes(key),
      ) &&
      VisibilityConditionStrictSchema.safeParse(record.$cond).success &&
      hasSafeExpressions(record.$then) &&
      hasSafeExpressions(record.$else)
    );
  }
  return false;
};

/**
 * Validates both the Langfuse safety envelope and the official json-render
 * catalog. The result deliberately exposes only stable failure codes; model or
 * trace content must never flow into telemetry through validation messages.
 */
export function validateCustomUiSpec(
  input: unknown,
): CustomUiSpecValidationResult {
  const length = byteLength(input);
  if (length === undefined || length > CUSTOM_UI_SPEC_LIMITS.maxBytes) {
    return { success: false, code: "TOO_LARGE" };
  }

  const shape = CustomUiSpecSchema.safeParse(input);
  if (!shape.success) return { success: false, code: "INVALID_SHAPE" };

  if (!hasSafeExpressions(shape.data)) {
    return { success: false, code: "DISALLOWED_EXPRESSION" };
  }

  const catalogResult = customUiCatalog.validate(shape.data);
  if (!catalogResult.success) {
    return { success: false, code: "INVALID_CATALOG" };
  }

  return { success: true, spec: shape.data, byteLength: length };
}
