import {
  memorySkillFiles,
  SkillsExtension,
} from "@modelcontextprotocol/server/ext/skills";
import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";

const PREFIX = "langfuse";

/**
 * The bundled Langfuse skills, served through the MCP Skills extension at
 * `skill://langfuse/<skill>/<path>` (skills/list, skills/get, resources/read).
 */
export const langfuseSkills = SkillsExtension.load(
  memorySkillFiles(
    Object.fromEntries(
      LANGFUSE_SKILLS.flatMap((skill) =>
        skill.resources.map((file) => [
          file.uri.slice(`skill://${PREFIX}/`.length),
          file.text,
        ]),
      ),
    ),
  ),
  { prefix: PREFIX, strict: true },
);
