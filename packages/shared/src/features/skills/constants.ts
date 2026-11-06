export const SKILL_LATEST_LABEL = "latest";
export const SKILL_PRODUCTION_LABEL = "production";
export const MAX_SKILL_FILES = 200;
export const MAX_SKILL_PATH_LENGTH = 512;

// Skill size limits are configurable per deployment so self-hosted instances
// can raise or lower them. Only server processes see LANGFUSE_* env vars; the
// browser bundle falls back to the defaults and reads the effective limits
// from the skills tRPC router instead. Unparseable or non-positive values keep
// the default, and a ceiling keeps a misconfigured value from defeating the
// archive-expansion guards.
const SKILL_BYTE_LIMIT_CEILING = 100 * 1024 * 1024;

export const DEFAULT_MAX_SKILL_BYTES = 1_000_000;
export const DEFAULT_MAX_SKILL_ZIP_UPLOAD_BYTES = 3 * 1024 * 1024;

function byteLimitFromEnv(
  override: string | undefined,
  fallback: number,
): number {
  if (!override) return fallback;
  const parsed = Number.parseInt(override, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, SKILL_BYTE_LIMIT_CEILING);
}

export const MAX_SKILL_BYTES = byteLimitFromEnv(
  process.env.LANGFUSE_SKILL_MAX_BYTES,
  DEFAULT_MAX_SKILL_BYTES,
);

export const MAX_SKILL_ZIP_UPLOAD_BYTES = byteLimitFromEnv(
  process.env.LANGFUSE_SKILL_IMPORT_MAX_ZIP_BYTES,
  DEFAULT_MAX_SKILL_ZIP_UPLOAD_BYTES,
);

// Limits the import UI enforces client-side. Server processes evaluate this
// with the environment override applied; the client fetches the effective
// values from the skills tRPC router and falls back to these defaults while
// loading.
export type SkillImportLimits = {
  maxSkillBytes: number;
  maxZipUploadBytes: number;
};

export const DEFAULT_SKILL_IMPORT_LIMITS: SkillImportLimits = {
  maxSkillBytes: MAX_SKILL_BYTES,
  maxZipUploadBytes: MAX_SKILL_ZIP_UPLOAD_BYTES,
};

export const MAX_SKILL_CATALOG_JSON_BYTES = 64 * 1024;
export const MAX_SKILL_TOOL_ARGS_JSON_BYTES = 16 * 1024;
