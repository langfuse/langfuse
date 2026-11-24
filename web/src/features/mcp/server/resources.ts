import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import type { createMcpServer } from "./mcpServer";
import {
  resourceNotFound,
  resourceResultCache,
} from "../core/resource-results";
import { listSkillResources, readSkillResource } from "./skills/resources";
import { clientMayRenderApps } from "../core/mcp-app";
import { listAppResources, readAppResource } from "./apps/resources";

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
    const resource = (await readAppResource(uri)) ?? readSkillResource(uri);
    if (!resource) throw resourceNotFound();
    return { ...resourceResultCache, contents: [resource] };
  });
}
