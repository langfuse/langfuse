import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { recordIncrement } from "@langfuse/shared/src/server";
import type { createMcpServer } from "./mcpServer";
import {
  resourceNotFound,
  resourceResultCache,
} from "../core/resource-results";
import { listSkillResources, readSkillResource } from "./skills/resources";
import { clientMayRenderApps } from "../core/mcp-app";
import { listAppResources, readAppResource } from "./apps/resources";

/**
 * Tags of `langfuse.mcp.resource_read`. Only known URIs become tag values: the
 * set is bounded by the bundled skills and MCP Apps, whereas a caller can send
 * any string.
 */
const resourceReadTags = ({
  uri,
  found,
  isApp,
}: {
  uri: string;
  found: boolean;
  isApp: boolean;
}) => {
  if (!found) return { kind: "unknown", uri: "unknown", outcome: "not_found" };
  return { kind: isApp ? "app" : "skill", uri, outcome: "success" };
};

/**
 * Registers the MCP resource handlers: bundled skill files and the `ui://`
 * documents of MCP App tools.
 */
export function registerResources(server: ReturnType<typeof createMcpServer>) {
  server.setRequestHandler("resources/list", async (request, ctx) => {
    if (request.params?.cursor !== undefined) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        "Invalid resources cursor",
      );
    }
    return {
      ...resourceResultCache,
      resources: [
        ...listSkillResources(),
        ...(clientMayRenderApps(ctx) ? listAppResources() : []),
      ],
    };
  });
  server.setRequestHandler("resources/templates/list", async () => ({
    ...resourceResultCache,
    resourceTemplates: [],
  }));
  server.setRequestHandler("resources/read", async (request) => {
    const uri = request.params.uri;
    const appResource = await readAppResource(uri);
    const resource = appResource ?? readSkillResource(uri);
    recordIncrement(
      "langfuse.mcp.resource_read",
      1,
      resourceReadTags({
        uri,
        found: resource !== undefined,
        isApp: appResource !== undefined,
      }),
    );
    if (!resource) throw resourceNotFound();
    return { ...resourceResultCache, contents: [resource] };
  });
}
