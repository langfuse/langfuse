/**
 * Client-safe utility functions for prompt handling
 */

import { parseUnknownToString } from "../features/evals/utilities";

export interface PromptMessage {
  type?: string;
  name?: string;
  role?: string;
  content?: string;
}

export function compileTemplateString(
  template: string,
  context: Record<string, unknown>,
) {
  try {
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key: string) => {
      if (!(key in context)) return match;

      const value = context[key];
      return value === undefined || value === null ? "" : String(value);
    });
  } catch {
    return template;
  }
}

export function compileEvalPrompt(params: {
  templatePrompt: string;
  variables: Array<{ var: string; value: unknown }>;
}) {
  return compileTemplateString(
    params.templatePrompt,
    Object.fromEntries(
      params.variables.map(({ var: key, value }) => [
        key,
        parseUnknownToString(value),
      ]),
    ),
  );
}

/**
 * Extracts placeholder names from prompt messages.
 * This is a client-safe version that doesn't depend on server-side types.
 * @param messages Array of prompt messages
 * @returns Array of placeholder names
 */
export function extractPlaceholderNames(messages: PromptMessage[]): string[] {
  return messages
    .filter(
      (msg): msg is PromptMessage & { name: string } =>
        msg.type === "placeholder" && typeof msg.name === "string",
    )
    .map((msg) => msg.name);
}
