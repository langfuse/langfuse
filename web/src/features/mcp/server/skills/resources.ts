import { z } from "zod";
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";
import type { createMcpServer } from "../mcpServer";
import {
  resourceNotFound,
  resourceResultCache,
} from "../../core/resource-results";

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
    return { ...resourceResultCache, skills };
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
      if (!official) throw resourceNotFound();
      return { ...resourceResultCache, skill: official };
    },
  );
}

/** Skill files listed as MCP resources. */
export const listSkillResources = () =>
  skills.map((skill) => ({
    uri: skill.uri,
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    mimeType: "text/markdown",
  }));

/** Contents of one skill file, or undefined when the URI is not a skill file. */
export const readSkillResource = (uri: string) =>
  resources.find((file) => file.uri === uri);
