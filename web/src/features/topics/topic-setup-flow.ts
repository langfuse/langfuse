import { LLMAdapter, supportedModels } from "@langfuse/shared";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";

export const TOPIC_SETUP_QUESTIONS = [
  { name: "Intent" },
  { name: "Sentiment" },
  { name: "Outcome" },
  { name: "Issues" },
] as const;

export const TOPIC_SETUP_WAIT_MINUTES = [2, 5, 10] as const;
const TOPIC_SETUP_DEFAULT_WAIT_MINUTES = 5;
// Every setup summarizes up to this many recent traces so first topics form quickly.
export const TOPIC_SETUP_BACKFILL_DAYS = 7;
export const TOPIC_SETUP_BACKFILL_LIMIT = 500;
const TOPIC_SETUP_MIN_PAST_TRACES = 100;

export type TopicSetupStep = "questions" | "traces" | "review";
export type TopicSetupWaitMinutes = (typeof TOPIC_SETUP_WAIT_MINUTES)[number];
export type TopicSetupQuestion = {
  name: (typeof TOPIC_SETUP_QUESTIONS)[number]["name"];
  description: string;
  enabled: boolean;
};

export type TopicSetupConnection = {
  id: string;
  provider: string;
  adapter: string;
  customModels: string[];
  withDefaultModels: boolean;
};

export type TopicSetupDraft = {
  step: TopicSetupStep;
  questions: TopicSetupQuestion[];
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  clustering: JudgeModel | null;
  waitMinutes: TopicSetupWaitMinutes;
  advancedOpen: boolean;
  samplePercent: number;
};

// Best family first; within a family the highest version wins (6.1 over 6).
const RECOMMENDED_MODELS: Record<
  "summary" | "embedding" | "clustering",
  RegExp[]
> = {
  summary: [/luna/i, /haiku-5[-.]5/i],
  embedding: [/text-embedding-3-small/i, /embed-v4/i],
  clustering: [/terra/i, /\bsol\b/i, /sonnet-5[-.]5/i],
};

const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
  "text-embedding-ada-002",
];
const GOOGLE_EMBEDDING_MODELS = [
  "textembedding-gecko",
  "textembedding-gecko-multilingual",
];

export function isRecommendedTopicModel(
  slot: "summary" | "embedding" | "clustering",
  model: string,
) {
  return RECOMMENDED_MODELS[slot].some((pattern) => pattern.test(model));
}

export function topicConnectionCaption(
  connections: Array<{ provider: string }>,
) {
  const providers = [
    ...new Set(connections.map((connection) => connection.provider)),
  ];
  if (providers.length === 0) return "No AI connection";
  if (providers.length === 1) return providers[0]!;
  return "Project connections";
}

export function setupWaitMinutes(
  traceIdleMs: number | null,
): TopicSetupWaitMinutes {
  if (traceIdleMs == null) return TOPIC_SETUP_DEFAULT_WAIT_MINUTES;
  const minutes = traceIdleMs / 60_000;
  if (minutes === 2 || minutes === 5 || minutes === 10) return minutes;
  return TOPIC_SETUP_DEFAULT_WAIT_MINUTES;
}

function topicModelsFor(
  connection: TopicSetupConnection,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  const chat = connection.withDefaultModels
    ? (supportedModels[connection.adapter as keyof typeof supportedModels] ??
      [])
    : [];
  const embedding =
    kind === "embedding" && connection.withDefaultModels
      ? embeddingModelsFor(connection.adapter)
      : [];
  return Array.from(
    new Set(
      [savedModel, ...embedding, ...connection.customModels, ...chat].filter(
        (model): model is string => Boolean(model),
      ),
    ),
  );
}

export function topicProviderGroups(
  connections: TopicSetupConnection[],
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  return connections.map(
    (connection) =>
      [connection.provider, topicModelsFor(connection, kind, savedModel)] as [
        string,
        string[],
      ],
  );
}

export function pickRecommendedTopicModel(
  slot: "summary" | "embedding" | "clustering",
  providerGroups: Array<[string, string[]]>,
): JudgeModel | null {
  for (const pattern of RECOMMENDED_MODELS[slot]) {
    const matches = providerGroups.flatMap(([provider, models]) =>
      models
        .filter((model) => pattern.test(model))
        .map((model) => ({ provider, model })),
    );
    if (matches.length > 0)
      return matches.reduce((best, item) =>
        compareModelVersions(item.model, best.model) > 0 ? item : best,
      );
  }
  return null;
}

function compareModelVersions(a: string, b: string) {
  const left = (a.match(/\d+/g) ?? []).map(Number);
  const right = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? -1) - (right[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

function topicJudgeModel(
  slot: { llmApiKeyId: string; model: string } | null,
  connections: Array<{ id: string; provider: string }>,
): JudgeModel | null {
  if (!slot) return null;
  const connection = connections.find((item) => item.id === slot.llmApiKeyId);
  return {
    provider: connection?.provider ?? "Missing connection",
    model: slot.model,
  };
}

export function resolveTopicModelSlot(
  model: JudgeModel | null,
  connections: TopicSetupConnection[],
  preferredId: string | undefined,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  if (!model) return null;
  const matches = connections.filter(
    (connection) =>
      connection.provider === model.provider &&
      topicModelsFor(
        connection,
        kind,
        connection.id === preferredId ? savedModel : null,
      ).includes(model.model),
  );
  const llmApiKeyId =
    matches.find((connection) => connection.id === preferredId)?.id ??
    matches[0]?.id ??
    null;
  return llmApiKeyId ? { llmApiKeyId, model: model.model } : null;
}

export function initialTopicSetupDraft(input: {
  stored: {
    summary: { llmApiKeyId: string; model: string } | null;
    embedding: { llmApiKeyId: string; model: string } | null;
    clustering: { llmApiKeyId: string; model: string } | null;
  };
  connections: TopicSetupConnection[];
  facets: Array<{
    id: string;
    name: string;
    description?: string;
    isBuiltIn: boolean;
  }>;
  enabledFacetIds: ReadonlySet<string> | null;
  traceIdleMs: number | null;
}): TopicSetupDraft {
  const summaryGroups = topicProviderGroups(
    input.connections,
    "chat",
    input.stored.summary?.model,
  );
  const embeddingGroups = topicProviderGroups(
    input.connections,
    "embedding",
    input.stored.embedding?.model,
  );
  const clusteringGroups = topicProviderGroups(
    input.connections,
    "chat",
    input.stored.clustering?.model,
  );
  return {
    step: "questions",
    questions: TOPIC_SETUP_QUESTIONS.map((question) => {
      const existing = input.facets.find(
        (facet) => facet.isBuiltIn && facet.name === question.name,
      );
      return {
        name: question.name,
        description: topicQuestionDescription(
          question.name,
          existing?.description,
        ),
        enabled: input.enabledFacetIds
          ? Boolean(existing && input.enabledFacetIds.has(existing.id))
          : true,
      };
    }),
    summary:
      topicJudgeModel(input.stored.summary, input.connections) ??
      pickRecommendedTopicModel("summary", summaryGroups),
    embedding:
      topicJudgeModel(input.stored.embedding, input.connections) ??
      pickRecommendedTopicModel("embedding", embeddingGroups),
    clustering:
      topicJudgeModel(input.stored.clustering, input.connections) ??
      pickRecommendedTopicModel("clustering", clusteringGroups),
    waitMinutes: setupWaitMinutes(input.traceIdleMs),
    advancedOpen: false,
    samplePercent: 100,
  };
}

export function canLeaveTopicQuestions(input: {
  canWrite: boolean;
  questions: Array<{ enabled: boolean }>;
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  clustering: JudgeModel | null;
}) {
  return (
    input.canWrite &&
    input.questions.some((question) => question.enabled) &&
    Boolean(input.summary && input.embedding && input.clustering)
  );
}

export function followsTopicRecommendations(input: {
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  clustering: JudgeModel | null;
}) {
  return (
    Boolean(
      input.summary && isRecommendedTopicModel("summary", input.summary.model),
    ) &&
    Boolean(
      input.embedding &&
      isRecommendedTopicModel("embedding", input.embedding.model),
    ) &&
    Boolean(
      input.clustering &&
      isRecommendedTopicModel("clustering", input.clustering.model),
    )
  );
}

export function backfillNotice(matched: number) {
  if (matched >= TOPIC_SETUP_MIN_PAST_TRACES) return null;
  return `Only ${matched.toLocaleString("en-US")} traces from the last ${TOPIC_SETUP_BACKFILL_DAYS} days. Topics need about ${TOPIC_SETUP_MIN_PAST_TRACES} to form, so the first topics may take longer.`;
}

export type TopicSetupStage =
  | "summarizing"
  | "grouping"
  | "naming"
  | "done"
  | "failed";

type SetupExecution = {
  id: string;
  status: string;
  phase: string;
  updatedAt: string;
  input:
    | { operation: "process"; requestId: string; thenUpdate?: unknown }
    | { operation: "update"; requestId: string };
};

/** The newest setup backfill and the topic update it starts once summaries finish. */
export function topicSetupRun<T extends SetupExecution>(executions: T[]) {
  const process = executions.find(
    (execution) =>
      execution.input.operation === "process" &&
      Boolean(execution.input.thenUpdate),
  );
  if (!process) return null;
  const update =
    executions.find(
      (execution) =>
        execution.input.operation === "update" &&
        execution.input.requestId === `${process.id}-topics`,
    ) ?? null;
  return { process, update };
}

// The worker starts the topic update right after the last batch; longer means it failed to start.
const FOLLOW_UP_GRACE_MS = 2 * 60_000;

export function topicSetupStage(
  run: { process: SetupExecution; update: SetupExecution | null },
  now: number,
): { stage: TopicSetupStage; retryId: string | null } {
  const { process, update } = run;
  if (process.status === "failed")
    return { stage: "failed", retryId: process.id };
  if (process.status === "queued" || process.status === "running")
    return { stage: "summarizing", retryId: null };
  if (!update && now - Date.parse(process.updatedAt) > FOLLOW_UP_GRACE_MS)
    return { stage: "failed", retryId: null };
  if (!update || update.status === "queued")
    return { stage: "grouping", retryId: null };
  if (update.status === "failed")
    return { stage: "failed", retryId: update.id };
  if (update.status === "running")
    return {
      stage: update.phase === "clustering" ? "grouping" : "naming",
      retryId: null,
    };
  return { stage: "done", retryId: null };
}

function topicQuestionDescription(name: string, stored: string | undefined) {
  const description = stored?.trim();
  if (description) return description;
  return (
    DEFAULT_TOPIC_FACETS.find((facet) => facet.name === name)?.description ?? ""
  );
}

function embeddingModelsFor(adapter: string) {
  if (adapter === LLMAdapter.OpenAI || adapter === LLMAdapter.Azure)
    return OPENAI_EMBEDDING_MODELS;
  if (adapter === LLMAdapter.GoogleAIStudio || adapter === LLMAdapter.VertexAI)
    return GOOGLE_EMBEDDING_MODELS;
  return [];
}
