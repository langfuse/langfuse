import { z } from "zod";
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
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

const listParams = z.object({ cursor: z.string().optional() }).optional();
const getParams = z.object({ uri: z.string() });

const cache = {
  resultType: "complete",
  ttlMs: 0,
  cacheScope: "private",
} as const;

const notFound = () =>
  new ProtocolError(
    ProtocolErrorCode.InvalidParams,
    "Unknown skill or resource",
  );

export function registerSkillResources(
  server: ReturnType<typeof createMcpServer>,
) {
  const list = (cursor: string | undefined) => {
    if (cursor !== undefined) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        "Invalid skills cursor",
      );
    }
    return { ...cache, skills };
  };

  server.setRequestHandler(
    "skills/list",
    { params: listParams },
    async (params) => list(params?.cursor),
  );
  server.setRequestHandler(
    "skills/get",
    { params: getParams },
    async (params) => {
      const official = skills.find((skill) => skill.uri === params.uri);
      if (!official) throw notFound();
      return { ...cache, skill: official };
    },
  );
  server.setRequestHandler("resources/list", async (request) => {
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
  server.setRequestHandler("resources/templates/list", async () => ({
    ...cache,
    resourceTemplates: [],
  }));
  server.setRequestHandler("resources/read", async (request) => {
    const uri = request.params.uri;
    const resource = resources.find((file) => file.uri === uri);
    if (!resource) throw notFound();
    return { ...cache, contents: [resource] };
  });
}
