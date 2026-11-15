import { extractVariables, type PromptVariable } from "@langfuse/shared";

import type { PlaygroundCache } from "../types";

export function resolvePromptVariables(
  messages: NonNullable<PlaygroundCache>["messages"],
  previousVariables: PromptVariable[] = [],
): PromptVariable[] {
  const messageContents = messages
    .map((message) => ("content" in message ? message.content : message.name))
    .join("\n");
  const variables = extractVariables(messageContents)
    .map((variable) => variable.trim())
    .filter(Boolean);

  const next = previousVariables.reduce<PromptVariable[]>(
    (result, variable) => {
      const isUsed = variables.includes(variable.name);
      if (isUsed || variable.value) result.push({ ...variable, isUsed });
      return result;
    },
    [],
  );

  for (const name of variables) {
    if (!next.some((variable) => variable.name === name)) {
      next.push({ name, value: "", isUsed: true });
    }
  }

  return next;
}
