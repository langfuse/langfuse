import {
  MAX_SKILLS_PER_OBSERVATION,
  SkillsAvailableInputSchema,
  SkillsResourceLoadedSchema,
  type SkillsAvailableInput,
  type SkillsResourceLoaded,
} from "../../features/skills/trace";
import {
  MAX_SKILL_CATALOG_JSON_BYTES,
  MAX_SKILL_ERROR_JSON_BYTES,
  MAX_SKILL_PATH_LENGTH,
  MAX_SKILL_TOOL_ARGS_JSON_BYTES,
  SKILL_RESOURCE_TOOL_NAMES,
} from "../../features/skills/constants";
import { ObservationType } from "../../domain/observations";
import { logger } from "../logger";

export function extractSkillsFromObservation({
  skillsAvailable: manifest,
  observationType,
  name,
  input,
  output,
  isError,
  projectId,
}: {
  skillsAvailable: unknown;
  observationType: string;
  name: string;
  input: unknown;
  output: unknown;
  isError: boolean;
  projectId: string;
}): {
  skillsAvailable?: SkillsAvailableInput;
  skillsResourceLoaded?: SkillsResourceLoaded;
} {
  // Skill inference is enabled only when an availability attribute is reported.
  if (!manifest) return {};
  if (
    observationType !== ObservationType.GENERATION &&
    (observationType !== ObservationType.TOOL ||
      !SKILL_RESOURCE_TOOL_NAMES.has(name) ||
      output == null ||
      isError)
  ) {
    return {};
  }

  let parsedManifest = Array.isArray(manifest)
    ? manifest
    : parseJsonPayloadWithMaxSize(
        manifest,
        MAX_SKILL_CATALOG_JSON_BYTES,
        "skillsAvailable",
        projectId,
      );
  if (
    Array.isArray(parsedManifest) &&
    parsedManifest.length > MAX_SKILLS_PER_OBSERVATION
  ) {
    logger.warn("OTEL skill catalog dropped: item limit exceeded", {
      projectId,
      count: parsedManifest.length,
      limit: MAX_SKILLS_PER_OBSERVATION,
    });
    parsedManifest = undefined;
  }
  const available = Array.isArray(parsedManifest)
    ? SkillsAvailableInputSchema.safeParse(parsedManifest)
    : undefined;
  if (observationType === ObservationType.GENERATION) {
    if (available?.success) return { skillsAvailable: available.data };
    return {};
  }

  const candidate = extractSkillResource(
    name,
    input,
    output,
    available?.success ? available.data : [],
    projectId,
  );
  if (!candidate) return {};
  if (
    typeof candidate.filePath === "string" &&
    candidate.filePath.length > MAX_SKILL_PATH_LENGTH
  ) {
    logger.warn(
      "OTEL skill resource load dropped: path length limit exceeded",
      {
        projectId,
        name,
        length: candidate.filePath.length,
        limit: MAX_SKILL_PATH_LENGTH,
      },
    );
    return {};
  }
  const loaded = SkillsResourceLoadedSchema.element.safeParse(candidate);
  if (!loaded.success) return {};

  return {
    ...(available?.success ? { skillsAvailable: available.data } : {}),
    skillsResourceLoaded: [
      { skillName: loaded.data.skillName, filePath: loaded.data.filePath },
    ],
  };
}

function extractSkillResource(
  toolName: string,
  input: unknown,
  output: unknown,
  available: SkillsAvailableInput,
  projectId: string,
) {
  const args = parseJsonPayloadWithMaxSize(
    input,
    MAX_SKILL_TOOL_ARGS_JSON_BYTES,
    "toolInput",
    projectId,
  );
  if (!isPlainObject(args)) return;
  const oversizedPath = [args.path, args.file_path].find(
    (path) =>
      typeof path === "string" && path.length > MAX_SKILL_TOOL_ARGS_JSON_BYTES,
  );
  if (typeof oversizedPath === "string") {
    logger.warn(
      "OTEL skill resource load dropped: input path length limit exceeded",
      {
        projectId,
        toolName,
        length: oversizedPath.length,
        limit: MAX_SKILL_TOOL_ARGS_JSON_BYTES,
      },
    );
    return;
  }

  switch (toolName) {
    case "skill":
    case "Skill":
    case "loadSkill":
      if (isFailedSkillActivation(output, projectId)) return;
      return {
        skillName: args.name ?? args.skill,
        filePath: "SKILL.md",
      };
    case "skill_read":
      return {
        skillName: args.skillName,
        filePath: args.path,
      };
    case "readFile":
    case "Read":
      return extractSkillResourceFromPath(
        args.path ?? args.file_path,
        available,
      );
    default:
      return;
  }
}

function extractSkillResourceFromPath(
  path: unknown,
  available: SkillsAvailableInput,
) {
  if (typeof path !== "string") return;
  const segments = path.split("/");
  const matches = segments.filter((segment) =>
    available.some((skill) => skill.name === segment),
  );
  if (matches.length !== 1) return;
  const skillName = matches[0];
  return {
    skillName,
    filePath: segments.slice(segments.indexOf(skillName) + 1).join("/"),
  };
}

function isFailedSkillActivation(output: unknown, projectId: string): boolean {
  const result = parseJsonPayloadWithMaxSize(
    output,
    MAX_SKILL_ERROR_JSON_BYTES,
    "toolOutput",
    projectId,
  );
  return (
    isPlainObject(result) &&
    (result.isError === true || result.error !== undefined)
  );
}

function parseJsonPayloadWithMaxSize(
  payload: unknown,
  maxBytes: number,
  field: "skillsAvailable" | "toolInput" | "toolOutput",
  projectId: string,
): unknown {
  if (
    typeof payload === "string" &&
    (payload.length > maxBytes || Buffer.byteLength(payload, "utf8") > maxBytes)
  ) {
    logger.warn("OTEL skill payload parsing skipped: byte limit exceeded", {
      projectId,
      field,
      limitBytes: maxBytes,
      stringLength: payload.length,
    });
    return undefined;
  }
  if (payload && typeof payload === "object") return payload;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
