import { MAX_SKILL_ZIP_UPLOAD_BYTES } from "@langfuse/shared";

export { MAX_SKILL_ZIP_UPLOAD_BYTES };

// Keeps the wording the import checks have always used: whole MB for the
// defaults ("1 MB", "3 MB"), KB for sub-MB limits.
export function formatByteLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Math.round(mb) >= 1
    ? `${Math.round(mb)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
