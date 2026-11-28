import {
  LLMAdapter,
  supportedModels,
  type FilterState,
} from "@langfuse/shared";
import {
  DEFAULT_TOPIC_FACETS,
  DEFAULT_TOPIC_RULE_NAME,
} from "@langfuse/shared/topics";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";

/** @knipignore Keeps the setup dialog stories in sync with the production question sequence. */
export const TOPIC_SETUP_QUESTIONS = DEFAULT_TOPIC_FACETS.map(({ name }) => ({
  name,
}));

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
  baseURL: string | null;
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
  /** Observation filter of the first rule; empty means every trace. */
  filter: FilterState;
  /** Name typed for the map; null follows `defaultTopicMapName` of the filter. */
  name: string | null;
};

const TOPIC_MAP_NAME_MAX_LENGTH = 100;

/** The trace names an exact trace-name filter selects, else the default map name. */
/** @internal */
export function defaultTopicMapName(filter: FilterState) {
  const names = filter.flatMap((item) => {
    if (item.column !== "traceName") return [];
    if (item.type === "string" && item.operator === "=") return [item.value];
    if (item.type === "stringOptions" && item.operator === "any of")
      return item.value;
    return [];
  });
  const name = names
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, TOPIC_MAP_NAME_MAX_LENGTH);
  return name || DEFAULT_TOPIC_RULE_NAME;
}

export function topicSetupMapName(draft: TopicSetupDraft) {
  return draft.name ?? defaultTopicMapName(draft.filter);
}

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
// gecko is retired; these batch the several texts setup embeds per request.
// Vertex serves gemini-embedding-2 only on global/multi-region endpoints.
const GOOGLE_AI_STUDIO_EMBEDDING_MODELS = [
  "gemini-embedding-001",
  "gemini-embedding-2",
];
const VERTEX_AI_EMBEDDING_MODELS = ["gemini-embedding-001"];

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

/** @internal */
export function setupWaitMinutes(
  traceIdleMs: number | null,
): TopicSetupWaitMinutes {
  if (traceIdleMs == null) return TOPIC_SETUP_DEFAULT_WAIT_MINUTES;
  const minutes = traceIdleMs / 60_000;
  if (minutes === 2 || minutes === 5 || minutes === 10) return minutes;
  return TOPIC_SETUP_DEFAULT_WAIT_MINUTES;
}

export function topicModelsFor(
  connection: TopicSetupConnection,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  // These adapters have no embeddings API.
  if (
    kind === "embedding" &&
    (connection.adapter === LLMAdapter.Anthropic ||
      connection.adapter === LLMAdapter.TypeSafe)
  )
    return [];
  // The built-in chat lists never embed; custom models may, whatever their name.
  const chat =
    kind === "chat" && connection.withDefaultModels
      ? (supportedModels[connection.adapter as keyof typeof supportedModels] ??
        [])
      : [];
  const embedding =
    kind === "embedding" && connection.withDefaultModels
      ? embeddingModelsFor(connection)
      : [];
  const models = Array.from(
    new Set(
      [savedModel, ...embedding, ...connection.customModels, ...chat].filter(
        (model): model is string => Boolean(model),
      ),
    ),
  );
  if (kind === "chat") return models;
  const isEmbedding = (model: string) => /embed/i.test(model);
  return [
    ...models.filter(isEmbedding),
    ...models.filter((m) => !isEmbedding(m)),
  ];
}

export function topicProviderGroups(
  connections: TopicSetupConnection[],
  kind: "chat" | "embedding",
  saved?: JudgeModel | null,
) {
  return connections
    .map(
      (connection) =>
        [
          connection.provider,
          topicModelsFor(
            connection,
            kind,
            saved?.provider === connection.provider ? saved.model : null,
          ),
        ] as [string, string[]],
    )
    .filter(([, models]) => models.length > 0);
}

/** @internal */
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

/** The slot to save when the project's connection for the provider offers the model; `saved` keeps a stored model selectable. */
export function resolveTopicModelSlot(
  model: JudgeModel | null,
  connections: TopicSetupConnection[],
  kind: "chat" | "embedding",
  saved?: JudgeModel | null,
): JudgeModel | null {
  if (!model) return null;
  const connection = connections.find(
    (item) => item.provider === model.provider,
  );
  const savedModel = saved?.provider === model.provider ? saved.model : null;
  return connection &&
    topicModelsFor(connection, kind, savedModel).includes(model.model)
    ? { provider: model.provider, model: model.model }
    : null;
}

export function initialTopicSetupDraft(input: {
  stored: {
    summary: JudgeModel | null;
    embedding: JudgeModel | null;
    clustering: JudgeModel | null;
  };
  connections: TopicSetupConnection[];
  facets: Array<{
    id: string;
    name: string;
    description?: string;
    isBuiltIn: boolean;
  }>;
  enabledFacetIds: ReadonlySet<string> | null;
  /** The first rule's stored filter, when the project has one. */
  filter?: FilterState;
  /** The first rule's stored name, when the project has one. */
  name?: string;
  traceIdleMs: number | null;
}): TopicSetupDraft {
  const summaryGroups = topicProviderGroups(
    input.connections,
    "chat",
    input.stored.summary,
  );
  const embeddingGroups = topicProviderGroups(
    input.connections,
    "embedding",
    input.stored.embedding,
  );
  const clusteringGroups = topicProviderGroups(
    input.connections,
    "chat",
    input.stored.clustering,
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
      input.stored.summary ??
      pickRecommendedTopicModel("summary", summaryGroups),
    embedding:
      input.stored.embedding ??
      pickRecommendedTopicModel("embedding", embeddingGroups),
    clustering:
      input.stored.clustering ??
      pickRecommendedTopicModel("clustering", clusteringGroups),
    waitMinutes: setupWaitMinutes(input.traceIdleMs),
    advancedOpen: false,
    samplePercent: 100,
    filter: input.filter ?? [],
    name:
      input.name && input.name !== DEFAULT_TOPIC_RULE_NAME ? input.name : null,
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
  return `Only ${matched.toLocaleString("en-US")} matching traces in the last 30 days. Topics need about ${TOPIC_SETUP_MIN_PAST_TRACES} to form, so the first topics may take longer.`;
}

export type TopicSetupStage = "summarizing" | "grouping" | "done" | "failed";

type RuleSetup = {
  phase: "selecting" | "summarizing" | "fitting" | "done" | "failed";
  seededCount: number;
  facets: {
    facetId: string;
    state: string;
    settledCount: number;
    runId: string | null;
    runStatus: string | null;
  }[];
};

/** A rule setup's stage and per-facet progress over its seeded traces. */
export function topicRuleSetupProgress(setup: RuleSetup) {
  const stages: Record<RuleSetup["phase"], TopicSetupStage> = {
    selecting: "summarizing",
    summarizing: "summarizing",
    fitting: "grouping",
    done: "done",
    failed: "failed",
  };
  const stage = stages[setup.phase];
  const fitted = setup.facets.filter((facet) => facet.state !== "has_map");
  return {
    stage,
    active: setup.phase !== "done" && setup.phase !== "failed",
    fits: {
      done: fitted.filter(
        (facet) =>
          facet.runStatus !== null &&
          facet.runStatus !== "pending" &&
          facet.runStatus !== "running",
      ).length,
      total: fitted.length,
    },
    // Facets that reuse summaries or a map have nothing left to summarize.
    facets: setup.facets.map((facet) => ({
      facetId: facet.facetId,
      complete:
        facet.state === "short" ? facet.settledCount : setup.seededCount,
      requested: setup.seededCount,
    })),
  };
}

function topicQuestionDescription(name: string, stored: string | undefined) {
  const description = stored?.trim();
  if (description) return description;
  return (
    DEFAULT_TOPIC_FACETS.find((facet) => facet.name === name)?.description ?? ""
  );
}

function embeddingModelsFor({ adapter, baseURL }: TopicSetupConnection) {
  // OpenAI and its data-residency hosts; compatible hosts and Azure deployments name models themselves.
  if (adapter === LLMAdapter.OpenAI)
    return !baseURL ||
      (URL.canParse(baseURL) &&
        /(^|\.)api\.openai\.com$/.test(
          new URL(baseURL).hostname.replace(/\.$/, ""),
        ))
      ? OPENAI_EMBEDDING_MODELS
      : [];
  if (adapter === LLMAdapter.GoogleAIStudio)
    return GOOGLE_AI_STUDIO_EMBEDDING_MODELS;
  if (adapter === LLMAdapter.VertexAI) return VERTEX_AI_EMBEDDING_MODELS;
  return [];
}
