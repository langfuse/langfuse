import { z } from "zod/v4";

/**
 * All available product modules in Langfuse
 */
export const PRODUCT_MODULES = [
  "dashboards",
  "tracing",
  "evaluation",
  "prompt-management",
  "playground",
  "datasets",
] as const;

/**
 * Schema for product modules that can be enabled/disabled in the UI
 */
export const ProductModule = z.enum(PRODUCT_MODULES);

/**
 * Type for product modules that can be enabled/disabled in the UI
 */
export type ProductModule = z.infer<typeof ProductModule>;

/**
 * Parse environment variables to determine which product modules should be visible.
 *
 * Two configuration modes:
 * - When LANGFUSE_UI_VISIBLE_PRODUCT_MODULES is set: only listed modules are visible
 * - When LANGFUSE_UI_HIDDEN_PRODUCT_MODULES is set: all modules except listed ones are visible
 *
 * If both are set, LANGFUSE_UI_VISIBLE_PRODUCT_MODULES takes precedence.
 * If neither is set, all modules are visible.
 */
export function getVisibleProductModules(
  visibleModulesEnv?: string,
  hiddenModulesEnv?: string,
): ProductModule[] {
  // If both variables are set, visible list takes precedence with a warning
  if (visibleModulesEnv && hiddenModulesEnv) {
    console.warn(
      "Both LANGFUSE_UI_VISIBLE_PRODUCT_MODULES and LANGFUSE_UI_HIDDEN_PRODUCT_MODULES are set. " +
        "Using LANGFUSE_UI_VISIBLE_PRODUCT_MODULES as the allow list.",
    );
    return parseModulesList(visibleModulesEnv);
  }

  // Only hidden list set - return all modules except hidden ones
  if (hiddenModulesEnv) {
    const hiddenModules = parseModulesList(hiddenModulesEnv);
    return PRODUCT_MODULES.filter(
      (module) => !hiddenModules.includes(module as ProductModule),
    ) as ProductModule[];
  }

  // Only visible list set - return only the visible modules
  if (visibleModulesEnv) {
    return parseModulesList(visibleModulesEnv);
  }

  // Neither is set - all modules are visible
  return [...PRODUCT_MODULES] as ProductModule[];
}

/**
 * Parse comma-separated values into product modules array.
 * Invalid values are filtered out.
 */
function parseModulesList(input: string): ProductModule[] {
  if (!input || !input.trim()) return [];

  return input
    .toLowerCase()
    .split(",")
    .map((module) => module.trim())
    .filter(Boolean)
    .filter((module) =>
      PRODUCT_MODULES.includes(module as ProductModule),
    ) as ProductModule[];
}
