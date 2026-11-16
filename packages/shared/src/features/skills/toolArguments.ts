import { asRecord } from "../../utils/objects";
import { MAX_SKILL_TOOL_ARGS_JSON_BYTES } from "./constants";
import { MAX_SKILLS_PER_OBSERVATION } from "./trace";

const SKILL_TOOL_NAMES = new Set([
  "skill",
  "Skill",
  "loadSkill",
  "langfuse_loadSkill",
  "skill_read",
  "loadSkillResource",
  "langfuse_loadSkillResource",
  "readFile",
  "Read",
]);

/** Filters unsupported tools before decoding their arguments or skill catalog. */
export function isSkillLoadTool(toolName: string, metadata?: unknown): boolean {
  return (
    SKILL_TOOL_NAMES.has(toolName) ||
    (isCodexShellTool(toolName) && isCodexMetadata(metadata))
  );
}

type SkillToolArguments = Record<string, unknown> | string;

type SkillLoadRequest = {
  skillName: string;
  filePath: string;
  /** Original file-read path, retained for highlighting tool arguments. */
  sourcePath?: string;
  version?: unknown;
};

/** Decodes JSON arguments while preserving Codex's JavaScript tool input. */
export function parseSkillToolArguments(
  input: unknown,
): SkillToolArguments | undefined {
  if (typeof input === "string") {
    if (exceedsArgumentLimit(input)) return;
    const text = input;
    try {
      input = JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return undefined;
}

/** Extracts requested resources; callers decide whether a load succeeded. */
export function getSkillLoadRequestsFromArguments(
  toolName: string,
  args: SkillToolArguments,
  availableNames: readonly string[],
  metadata?: unknown,
): SkillLoadRequest[] {
  const namedArguments =
    typeof args === "object" && (args.name != null || args.skill != null);
  if (
    isCodexMetadata(metadata) &&
    isCodexShellTool(toolName) &&
    !namedArguments
  ) {
    return getSkillResourcesFromCommand(
      typeof args === "string" ? args : args.cmd,
      availableNames,
    );
  }
  if (typeof args === "string") return [];

  if (toolName === "readFile" || toolName === "Read") {
    const path = args.path ?? args.file_path;
    if (typeof path !== "string") return [];
    const resource = getSkillResourceFromPath(path, availableNames);
    if (!resource || !isSkillDirectoryPath(path, resource.skillName)) return [];
    return [{ ...resource, version: args.version }];
  }

  let skillName: unknown;
  let filePath: unknown;
  switch (toolName) {
    case "skill":
    case "Skill":
    case "loadSkill":
    case "langfuse_loadSkill":
      skillName = args.name ?? args.skill;
      filePath = "SKILL.md";
      break;
    case "skill_read":
      skillName = args.skillName;
      filePath = args.path;
      break;
    case "loadSkillResource":
    case "langfuse_loadSkillResource":
      skillName = args.name ?? args.skill;
      filePath = args.path;
      break;
    default:
      return [];
  }
  if (typeof skillName !== "string" || typeof filePath !== "string") return [];
  const nativeSkillName =
    toolName === "skill" || toolName === "skill_read"
      ? availableNames.find(
          (name) =>
            skillName === `/skills/${name}` ||
            skillName === `/skills/${name}/SKILL.md`,
        )
      : undefined;
  return [
    {
      skillName: nativeSkillName ?? skillName,
      filePath,
      version: args.version,
    },
  ];
}

function isCodexMetadata(metadata: unknown): boolean {
  const record = asRecord(metadata);
  const serviceName =
    record?.["resourceAttributes.service.name"] ??
    asRecord(record?.resourceAttributes)?.["service.name"];
  return serviceName === "codex";
}

function isCodexShellTool(toolName: string): boolean {
  return (
    toolName === "skill" ||
    toolName.startsWith("skill:") ||
    toolName === "exec" ||
    toolName === "exec_command"
  );
}

function exceedsArgumentLimit(value: string): boolean {
  return (
    value.length > MAX_SKILL_TOOL_ARGS_JSON_BYTES ||
    new TextEncoder().encode(value).byteLength > MAX_SKILL_TOOL_ARGS_JSON_BYTES
  );
}

function getSkillResourcesFromCommand(
  command: unknown,
  availableNames: readonly string[],
): SkillLoadRequest[] {
  if (typeof command !== "string" || exceedsArgumentLimit(command)) return [];
  const resources = new Map<string, SkillLoadRequest>();
  for (const path of getCatFilePaths(command)) {
    const resource = getSkillResourceFromPath(path, availableNames);
    if (resource) {
      resources.set(`${resource.skillName}/${resource.filePath}`, resource);
    }
  }
  return [...resources.values()].slice(0, MAX_SKILLS_PER_OBSERVATION);
}

/** Reads literal cat arguments without evaluating shell or JavaScript code. */
function* getCatFilePaths(command: string): Generator<string> {
  for (const cat of command.matchAll(/(?:^|[\s;"'`]|\\n)cat(?=[ \t])/g)) {
    const argument =
      /[ \t]+(?:'([^'\r\n]*)'|"([^"\r\n]*)"|([^\s"'`\\;|&,(){}<>]+))/gy;
    argument.lastIndex = cat.index + cat[0].length;
    let token: RegExpExecArray | null;
    while ((token = argument.exec(command)) !== null) {
      yield token[1] ?? token[2] ?? token[3];
    }
  }
}

/** Generic file reads need a skills directory to avoid matching unrelated files. */
function isSkillDirectoryPath(path: string, skillName: string): boolean {
  const segments = path.split("/");
  return (
    !segments.includes("..") &&
    segments[segments.indexOf(skillName) - 1] === "skills"
  );
}

function getSkillResourceFromPath(
  path: unknown,
  availableNames: readonly string[],
): SkillLoadRequest | undefined {
  if (typeof path !== "string") return;
  const segments = path.split("/");
  if (segments.includes("..")) return;
  const matches = segments.filter((segment) =>
    availableNames.includes(segment),
  );
  if (matches.length !== 1) return;
  const skillName = matches[0];
  return {
    skillName,
    filePath: segments.slice(segments.indexOf(skillName) + 1).join("/"),
    sourcePath: path,
  };
}
