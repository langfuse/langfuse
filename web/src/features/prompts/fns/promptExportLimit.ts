export const PROMPT_EXPORT_VERSION_LIMIT = 10_000;

const PROMPT_EXPORT_PROCEDURE_PATH = "prompts.exportAll";

/**
 * Sentence shown when a project has more prompt versions than export allows.
 * Returns null at or under the limit. The export counts every stored version,
 * including when the caller asks for only the latest version of each prompt.
 */
export function promptExportLimitMessage(versionCount: number): string | null {
  if (versionCount <= PROMPT_EXPORT_VERSION_LIMIT) return null;

  const count = versionCount.toLocaleString("en-US");
  const limit = PROMPT_EXPORT_VERSION_LIMIT.toLocaleString("en-US");

  return `This project has ${count} prompt versions, which is over the export limit of ${limit}. Narrow the export to fewer prompts. The limit counts every version in the project, so exporting only the latest version does not reduce it. Contact support if you need a bulk export.`;
}

/** True for the version-limit rejection, which the export dialog shows inline. */
export function isPromptExportLimitFailure(error: {
  code: string | undefined;
  path: string | undefined;
}): boolean {
  return (
    error.code === "BAD_REQUEST" && error.path === PROMPT_EXPORT_PROCEDURE_PATH
  );
}
