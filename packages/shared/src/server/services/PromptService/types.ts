import { type Prompt } from "../../../db";

export type PromptResult = Prompt & {
  resolutionGraph: PromptGraph | null;
};

export type PromptParams = {
  projectId: string;
  promptName: string;
} & (
  | { version: number; label: undefined }
  | { version: null | undefined; label: string }
);

export enum PromptServiceMetrics {
  PromptCacheHit = "prompt_cache_hit", // eslint-disable-line no-unused-vars
  PromptCacheMiss = "prompt_cache_miss", // eslint-disable-line no-unused-vars
}

export type PartialPrompt = Pick<
  Prompt,
  "id" | "prompt" | "name" | "version" | "labels"
>;

export type PromptReference = Pick<Prompt, "id" | "version" | "name">;

export type PromptGraph = {
  root: PromptReference;
  dependencies: Record<string, PromptReference[]>;
};

export type ResolvedPromptGraph = {
  graph: PromptGraph | null;
  resolvedPrompt: Prompt["prompt"];
};
