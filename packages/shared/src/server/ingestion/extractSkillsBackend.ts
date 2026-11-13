import {
  MAX_SKILLS_PER_OBSERVATION,
  SkillsAvailableInputSchema,
  SkillsResourceLoadedSchema,
  type SkillsAvailableInput,
  type SkillsResourceLoaded,
} from "../../features/skills/trace";
import {
  MAX_SKILL_CATALOG_JSON_BYTES,
  MAX_SKILL_PATH_LENGTH,
  MAX_SKILL_TOOL_ARGS_JSON_BYTES,
} from "../../features/skills/constants";
import {
  getSkillLoadRequestsFromArguments,
  isSkillLoadTool,
  parseSkillToolArguments,
} from "../../features/skills/toolArguments";
import { ObservationType } from "../../domain/observations";
import { logger } from "../logger";

export function extractSkillsFromObservation({
  skillsAvailable: manifest,
  observationType,
  name,
  input,
  output,
  isError,
  metadata,
  projectId,
}: {
  skillsAvailable: unknown;
  observationType: string;
  name: string;
  input: unknown;
  output: unknown;
  isError: boolean;
  metadata?: unknown;
  projectId: string;
}): {
  skillsAvailable?: SkillsAvailableInput;
  skillsResourceLoaded?: SkillsResourceLoaded;
} {
  if (
    observationType !== ObservationType.GENERATION &&
    (observationType !== ObservationType.TOOL ||
      output == null ||
      isError ||
      !isSkillLoadTool(name, metadata))
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

  const candidates = getSkillLoadRequestsFromInput(
    name,
    input,
    available?.success ? available.data : [],
    projectId,
    metadata,
  );
  const resources: SkillsResourceLoaded = [];
  for (const resource of candidates) {
    if (
      typeof resource.filePath === "string" &&
      resource.filePath.length > MAX_SKILL_PATH_LENGTH
    ) {
      logger.warn(
        "OTEL skill resource load dropped: path length limit exceeded",
        {
          projectId,
          name,
          length: resource.filePath.length,
          limit: MAX_SKILL_PATH_LENGTH,
        },
      );
      continue;
    }
    const loaded = SkillsResourceLoadedSchema.element.safeParse(resource);
    if (loaded.success) {
      resources.push({
        skillName: loaded.data.skillName,
        filePath: loaded.data.filePath,
      });
    }
  }
  if (!resources.length) return {};

  return {
    ...(available?.success ? { skillsAvailable: available.data } : {}),
    skillsResourceLoaded: resources,
  };
}

function getSkillLoadRequestsFromInput(
  toolName: string,
  input: unknown,
  available: SkillsAvailableInput,
  projectId: string,
  metadata: unknown,
) {
  if (
    isPayloadTooLarge(
      input,
      MAX_SKILL_TOOL_ARGS_JSON_BYTES,
      "toolInput",
      projectId,
    )
  ) {
    return [];
  }
  const args = parseSkillToolArguments(input);
  if (args === undefined) return [];

  if (typeof args === "object") {
    const oversizedPath = [args.path, args.file_path].find(
      (path) =>
        typeof path === "string" &&
        path.length > MAX_SKILL_TOOL_ARGS_JSON_BYTES,
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
      return [];
    }
  }

  return getSkillLoadRequestsFromArguments(
    toolName,
    args,
    available.map((skill) => skill.name),
    metadata,
  );
}

function parseJsonPayloadWithMaxSize(
  payload: unknown,
  maxBytes: number,
  field: "skillsAvailable" | "toolInput",
  projectId: string,
): unknown {
  if (isPayloadTooLarge(payload, maxBytes, field, projectId)) return undefined;
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

function isPayloadTooLarge(
  payload: unknown,
  maxBytes: number,
  field: "skillsAvailable" | "toolInput",
  projectId: string,
): boolean {
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
    return true;
  }
  return false;
}
