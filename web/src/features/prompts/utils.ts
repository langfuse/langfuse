import { LATEST_PROMPT_LABEL, PRODUCTION_LABEL } from "@langfuse/shared";

export const isReservedPromptLabel = (label: string) => {
  return [PRODUCTION_LABEL, LATEST_PROMPT_LABEL].includes(label);
};

/**
 * Href for a prompt's detail page.
 *
 * Prompt names can contain slashes (folder grouping, e.g. "folder/name") and
 * even empty or leading segments ("a//b", "/name"). The whole name is encoded
 * as a single path segment so the href never contains empty segments ("//" is
 * rejected by next/router); the catch-all detail route decodes it and joins
 * the segments back into the full name, so folder semantics are unchanged.
 */
export const getPromptDetailHref = (
  projectId: string,
  promptName: string,
): string => `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`;
