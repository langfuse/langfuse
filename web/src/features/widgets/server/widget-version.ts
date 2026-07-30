import { env } from "@/src/env.mjs";

/** The lowest widget query version the current deployment can serve. */
export function deploymentMinWidgetVersion(): number {
  return env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy" ? 1 : 2;
}
