import { z } from "zod";
import type { Prisma, Prompt, PromptVariable } from "@langfuse/shared";

export type PromptReplaySource = "compiled" | "recorded" | "latest";

const recordedVariablesSchema = z.object({
  promptVariables: z.record(z.string().min(1), z.string()),
});

type RecordedVariablesResult =
  | { success: true; variables: Record<string, string> }
  | { success: false; reason: string };

export function readRecordedPromptVariables(
  metadata: string | null,
): RecordedVariablesResult {
  const reason =
    "Record a non-empty promptVariables object containing string values in generation metadata.";
  if (!metadata) return { success: false, reason };

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { success: false, reason: "Generation metadata is not valid JSON." };
  }

  const result = recordedVariablesSchema.safeParse(parsed);
  if (
    !result.success ||
    Object.keys(result.data.promptVariables).length === 0
  ) {
    return { success: false, reason };
  }

  return { success: true, variables: result.data.promptVariables };
}

export function bindRecordedPromptVariables(
  names: readonly string[],
  recorded: Record<string, string>,
): PromptVariable[] {
  const values = new Map(Object.entries(recorded));
  return names.map((name) => ({
    name,
    value: values.get(name) ?? "",
    isUsed: true,
  }));
}

type PromptReplayQueries = {
  getPrompt: (input: {
    projectId: string;
    id: string;
  }) => Promise<Prompt | null>;
  getVersions: (input: {
    projectId: string;
    name: string;
    limit: number;
    page: number;
  }) => Promise<{ promptVersions: Prompt[] }>;
  resolvePrompt: (input: {
    projectId: string;
    promptId: string;
  }) => Promise<{ resolvedPrompt: Prisma.JsonValue }>;
};

export async function loadPromptReplay(
  input: {
    projectId: string;
    promptId: string;
    source: Exclude<PromptReplaySource, "compiled">;
  },
  queries: PromptReplayQueries,
): Promise<(Prompt & { resolvedPrompt: Prisma.JsonValue }) | null> {
  let prompt = await queries.getPrompt({
    projectId: input.projectId,
    id: input.promptId,
  });
  if (!prompt) return null;

  if (input.source === "latest") {
    const versions = await queries.getVersions({
      projectId: input.projectId,
      name: prompt.name,
      limit: 1,
      page: 0,
    });
    prompt = versions.promptVersions[0] ?? null;
    if (!prompt) return null;
  }

  const graph = await queries.resolvePrompt({
    projectId: input.projectId,
    promptId: prompt.id,
  });
  return { ...prompt, resolvedPrompt: graph.resolvedPrompt };
}
