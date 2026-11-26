import type { ClientCapabilities } from "@modelcontextprotocol/server";
import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";
import { recordIncrement } from "@langfuse/shared/src/server";
import { clientMayRenderApps } from "../core/mcp-app";
import { WIDGET_APP_RESOURCE_URI } from "./apps/resources";

const SKILL_FILE_URIS = new Set(
  LANGFUSE_SKILLS.flatMap((skill) => skill.resources.map(({ uri }) => uri)),
);

const resourceReadTags = (
  uri: unknown,
  clientCapabilities: ClientCapabilities | undefined,
) => {
  if (
    uri === WIDGET_APP_RESOURCE_URI &&
    clientMayRenderApps(clientCapabilities)
  ) {
    return { kind: "app", uri, outcome: "success" };
  }
  if (typeof uri === "string" && SKILL_FILE_URIS.has(uri)) {
    return { kind: "skill", uri, outcome: "success" };
  }
  return { kind: "unknown", uri: "unknown", outcome: "not_found" };
};

/**
 * Counts a `resources/read` request body as `langfuse.mcp.resource_read`,
 * tagged by kind, URI and outcome. Only URIs this server serves to the client
 * become tag values: the set is bounded by the bundled skills and MCP Apps,
 * whereas a caller can send any string.
 */
export const recordResourceRead = (
  body: unknown,
  clientCapabilities: ClientCapabilities | undefined,
) => {
  const { method, params } =
    (body as { method?: unknown; params?: { uri?: unknown } } | undefined) ??
    {};
  if (method !== "resources/read") return;
  recordIncrement(
    "langfuse.mcp.resource_read",
    1,
    resourceReadTags(params?.uri, clientCapabilities),
  );
};
