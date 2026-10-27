import {
  fact,
  fitPageContextSnapshot,
  formatEntityTypeLabel,
  truncateText,
} from "@/src/features/page-context/fns/pageContextFormatting";
import {
  PAGE_CONTEXT_LIMITS,
  type PageContextFact,
  type PageContextSnapshot,
} from "@/src/features/page-context/types";

export type PromptForPageContext = {
  name: string;
  version: number;
  type: string;
  labels: string[];
  tags: string[];
  config: unknown;
  prompt: unknown;
  createdAt: Date;
};

function configuredModel(config: unknown): string | undefined {
  if (config && typeof config === "object" && "model" in config) {
    const { model } = config;
    return typeof model === "string" ? model : undefined;
  }
  return undefined;
}

function promptText(prompt: unknown): string {
  if (typeof prompt === "string") {
    return prompt;
  }
  return JSON.stringify(prompt) ?? "";
}

/** The prompt version on screen: its identity, labels and a preview of its content. */
export function buildPromptPageContext(params: {
  prompt: PromptForPageContext;
  versionCount: number;
  path: string;
}): PageContextSnapshot {
  const { prompt } = params;
  const facts: PageContextFact[] = [
    fact("version", "Version", `v${prompt.version}`, prompt.version),
    fact("type", "Type", formatEntityTypeLabel(prompt.type), prompt.type),
    fact(
      "labels",
      "Labels",
      prompt.labels.length > 0 ? prompt.labels.join(", ") : "none",
    ),
    fact(
      "versions",
      "Versions",
      String(params.versionCount),
      params.versionCount,
    ),
  ];
  const model = configuredModel(prompt.config);
  if (model) {
    facts.push(fact("model", "Model", model, model));
  }
  if (prompt.tags.length > 0) {
    facts.push(fact("tags", "Tags", prompt.tags.join(", ")));
  }
  facts.push(
    fact(
      "created_at",
      "Created",
      prompt.createdAt.toISOString().slice(0, 10),
      prompt.createdAt.toISOString(),
    ),
  );
  const content = promptText(prompt.prompt);
  if (content) {
    facts.push(fact("content", "Content", content, content));
  }

  return fitPageContextSnapshot({
    version: 1,
    kind: "prompt",
    label: "Prompt",
    id: truncateText(
      `${prompt.name}@${prompt.version}`,
      PAGE_CONTEXT_LIMITS.id,
    ),
    title: truncateText(prompt.name, PAGE_CONTEXT_LIMITS.title),
    facts: facts.slice(0, PAGE_CONTEXT_LIMITS.facts),
    surface: "page",
    path: truncateText(params.path, PAGE_CONTEXT_LIMITS.path),
  });
}
