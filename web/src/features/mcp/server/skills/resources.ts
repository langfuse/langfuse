import { z } from "zod";
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  RequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";
import type { createMcpServer } from "../mcpServer";

const skills = LANGFUSE_SKILLS.map(({ uri, frontmatter, resources }) => ({
  uri,
  frontmatter,
  resources: resources.map(({ uri, digest, size }) => ({
    uri,
    digest,
    size,
  })),
}));
const resources = LANGFUSE_SKILLS.flatMap((skill) =>
  skill.resources.map((resource) => ({
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: resource.text,
  })),
);

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
    return { ...cache, skills };
  };

  server.setRequestHandler(listSchema, async (request) =>
    list(request.params?.cursor),
  );
  server.setRequestHandler(getSchema, async (request) => {
    const official = skills.find((skill) => skill.uri === request.params.uri);
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
    const resource = resources.find((file) => file.uri === uri);
    if (!resource) throw notFound();
    return { ...cache, contents: [resource] };
  });
}
