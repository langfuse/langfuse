import { LATEST_PROMPT_LABEL, PRODUCTION_LABEL } from "@langfuse/shared";
import { type LabelListItem } from "@/src/components/design-system/LabelList/LabelList";

export const isReservedPromptLabel = (label: string) => {
  return [PRODUCTION_LABEL, LATEST_PROMPT_LABEL].includes(label);
};

/** Production first, then latest, then the rest alphabetically. */
export const toPromptLabelListItems = (labels: string[]): LabelListItem[] =>
  [...labels]
    .sort((a, b) => {
      if (a === PRODUCTION_LABEL) return -1;
      if (b === PRODUCTION_LABEL) return 1;
      if (a === LATEST_PROMPT_LABEL) return -1;
      if (b === LATEST_PROMPT_LABEL) return 1;
      return a.localeCompare(b);
    })
    .map((name) => ({ name, isProduction: name === PRODUCTION_LABEL }));

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
