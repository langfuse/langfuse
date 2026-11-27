import { isInAppAgentInstanceEnabled } from "@langfuse/shared/in-app-agent/server/modelProvider";

/**
 * Instance switch is the default. Explicit `"false"` opts a split-role
 * worker out of this surface.
 */
export function isInAppAgentWorkerSurfaceEnabled(
  override?: "true" | "false",
): boolean {
  return isInAppAgentInstanceEnabled() && override !== "false";
}
