import { env } from "@/src/env.mjs";

/**
 * The highest widget query version the current deployment can serve. On a
 * dual-write deployment this is also the default for new widgets.
 */
export function maxSupportedWidgetVersion(): number {
  return env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy" ? 1 : 2;
}
