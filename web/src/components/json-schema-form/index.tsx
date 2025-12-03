"use client";

import { withTheme, type ThemeProps } from "@rjsf/core";
import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

import { generateWidgets } from "./widgets";
import { generateTemplates } from "./templates";

export { generateWidgets } from "./widgets";
export { generateTemplates } from "./templates";

/**
 * Generate a complete Shadcn theme for react-jsonschema-form
 */
export function generateTheme<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(): ThemeProps<T, S, F> {
  return {
    widgets: generateWidgets<T, S, F>(),
    templates: generateTemplates<T, S, F>(),
  };
}

/**
 * Pre-configured Shadcn theme object for use with withTheme()
 */
export const Theme = generateTheme();

/**
 * Pre-configured Form component with Shadcn theme applied
 *
 * @example
 * ```tsx
 * import { JSONSchemaForm } from "@/src/components/json-schema-form";
 * import validator from "@rjsf/validator-ajv8";
 *
 * <JSONSchemaForm
 *   schema={schema}
 *   validator={validator}
 *   onSubmit={handleSubmit}
 * />
 * ```
 */
export const JSONSchemaForm = withTheme(Theme);

// Re-export types and utilities that consumers might need
export type { ThemeProps } from "@rjsf/core";
export type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

// Re-export individual widgets and templates for customization
export * from "./widgets";
export * from "./templates";
