import { z } from "zod";
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  RequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  LANGFUSE_MCP_SKILLS,
  LANGFUSE_MCP_RESOURCES,
} from "@repo/langfuse-skills/mcp";
import type { createMcpServer } from "../mcpServer";

const listSchema = RequestSchema.extend({
  method: z.literal("skills/list"),
  params: z.object({ cursor: z.string().optional() }).optional(),
});
const getSchema = RequestSchema.extend({
  method: z.literal("skills/get"),
  params: z.object({ uri: z.string() }),
});

const cache = {
  resultType: "complete",
  ttlMs: 0,
  cacheScope: "private",
} as const;

const notFound = () =>
  new McpError(ErrorCode.InvalidParams, "Unknown skill or resource");

export function registerSkillResources(
  server: ReturnType<typeof createMcpServer>,
) {
  const list = (cursor: string | undefined) => {
    if (cursor !== undefined) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid skills cursor");
    }
    return { ...cache, skills: LANGFUSE_MCP_SKILLS };
  };

  server.setRequestHandler(listSchema, async (request) =>
    list(request.params?.cursor),
  );
  server.setRequestHandler(getSchema, async (request) => {
    const official = LANGFUSE_MCP_SKILLS.find(
      (skill) => skill.uri === request.params.uri,
    );
    if (!official) throw notFound();
    return { ...cache, skill: official };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const result = list(request.params?.cursor);
    return {
      ...cache,
      resources: result.skills.map((skill) => ({
        uri: skill.uri,
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        mimeType: "text/markdown",
      })),
    };
  });
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    ...cache,
    resourceTemplates: [],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const resource = LANGFUSE_MCP_RESOURCES.find((file) => file.uri === uri);
    if (!resource) throw notFound();
    return { ...cache, contents: [resource] };
  });
}
