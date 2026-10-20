import {
  LLMAdapter,
  supportedModels,
  type FilterState,
} from "@langfuse/shared";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";

export const TOPIC_SETUP_QUESTIONS = [
  { name: "Intent" },
  { name: "Sentiment" },
  { name: "Outcome" },
  { name: "Issues" },
] as const;

export const TOPIC_SETUP_WAIT_MINUTES = [2, 5, 10] as const;
export const TOPIC_SETUP_DEFAULT_WAIT_MINUTES = 5;
export const TOPIC_SETUP_PAST_RANGES = [
  { days: 1, label: "Past 24 hours" },
  { days: 7, label: "Past 7 days" },
  { days: 30, label: "Past 30 days" },
] as const;
export const TOPIC_SETUP_MIN_PAST_TRACES = 100;

export const TOPIC_SETUP_DEFAULT_FILTER: FilterState = [
  {
    column: "isRootObservation",
    type: "boolean",
    operator: "=",
    value: true,
  },
];

export type TopicSetupStep = "questions" | "traces" | "review";
export type TopicSetupWaitMinutes = (typeof TOPIC_SETUP_WAIT_MINUTES)[number];
export type TopicSetupPastDays =
  (typeof TOPIC_SETUP_PAST_RANGES)[number]["days"];
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
  pastOn: boolean;
  pastDays: TopicSetupPastDays;
  filter: FilterState;
  filterMode: "query" | "builder";
};

const RECOMMENDED_MODEL: Record<
  "summary" | "embedding" | "clustering",
  RegExp[]
> = {
  summary: [/haiku/i, /luna/i, /flash/i, /mini/i],
  embedding: [/embed/i, /titan/i],
  clustering: [/sonnet/i, /terra/i, /opus/i],
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
  return RECOMMENDED_MODEL[slot].some((pattern) => pattern.test(model));
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

export function firstTopicsEstimate(waitMinutes: number) {
  return `New traces are summarized after they have been idle for ${waitMinutes} min.`;
}

export function topicModelsFor(
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
  for (const [provider, models] of providerGroups) {
    const model = models.find((item) => isRecommendedTopicModel(slot, item));
    if (model) return { provider, model };
  }
  return null;
}

export function topicJudgeModel(
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
    pastOn: true,
    pastDays: 7,
    filter: TOPIC_SETUP_DEFAULT_FILTER,
    filterMode: "query",
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

export function pastBatchLimit(matched: number, samplePercent: number) {
  const selected = Math.round((matched * samplePercent) / 100);
  if (selected <= 0) return 0;
  return Math.min(TOPICS_BACKFILL_TRACE_LIMIT, selected);
}

export function pastBatchNotice(matched: number, samplePercent: number) {
  const selected = Math.round((matched * samplePercent) / 100);
  if (selected < TOPIC_SETUP_MIN_PAST_TRACES)
    return {
      kind: "small" as const,
      message: `Only ${selected.toLocaleString("en-US")} past traces match. Topics need about 100 to form.`,
    };
  if (selected > TOPICS_BACKFILL_TRACE_LIMIT)
    return {
      kind: "capped" as const,
      message: "Only the first 1,000 will run.",
    };
  return null;
}

export function summaryRunProgress(
  facets: Array<{ counts: { complete: number; requested: number } }>,
) {
  if (facets.length === 0) return { complete: 0, requested: 0 };
  const requested = Math.max(...facets.map((facet) => facet.counts.requested));
  const complete = Math.round(
    facets.reduce((sum, facet) => sum + facet.counts.complete, 0) /
      facets.length,
  );
  return { complete: Math.min(complete, requested), requested };
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
