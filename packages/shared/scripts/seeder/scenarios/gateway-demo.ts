import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma, type Role } from "../../../src/db";
import { encrypt } from "../../../src/encryption";
import {
  OrganizationId,
  SystemRoleId,
  UserId,
} from "../../../src/features/rbac/types";
import {
  createApiKey,
  createEvent,
  createEventsCh,
  EventRecordInsertType,
  getDisplaySecretKey,
} from "../../../src/server";
import {
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "../../../src/features/ai-gateway/constants";
import {
  AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME,
  AI_GATEWAY_KEY_ID_METADATA_KEY,
} from "../../../src/server/otel/OtelIngestionProcessor";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows } from "./verify";

/**
 * A self-contained "Acme" organization that uses the AI Gateway for its
 * engineering team's coding agents, built for demos and screen recordings of
 * the gateway analytics, keys table and ingestion-project traces.
 *
 * Postgres: the Acme organization, ten @acme.com users (password "password"),
 * a gateway ingestion project, the gateway config, OpenAI and Anthropic
 * connections with fake credentials, one gateway key per user and one
 * service key for a CI review bot.
 *
 * ClickHouse: one root GENERATION event per gateway request over the last
 * --days days ending now, in the shape gateway ingestion writes. Users have
 * their own agent (Claude Code, Codex, opencode), model mix, volume, timezone
 * and working hours; requests come in agent sessions whose cached context
 * grows request by request. All models have Langfuse default prices and the
 * costs below match them.
 */

const ORG_ID = "acme-gateway-demo-org";
const INGESTION_PROJECT_ID = "acme-gateway-demo-ingestion";
const PASSWORD = "password";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Provider = "anthropic" | "openai";
type AgentName = "claude-code" | "codex" | "opencode";

/** USD per 1M tokens, from worker/src/constants/default-model-prices.json. */
const MODELS = {
  "claude-opus-4-8": {
    provider: "anthropic",
    modelId: "80753fd5-342b-4ed3-bbb1-57d3d57b7e03",
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    modelId: "90ec5ec3-1a48-4ff0-919c-70cdb8f632ed",
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    modelId: "cmgt5gnkv000104jx171tbq4e",
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  "gpt-5.6-sol": {
    provider: "openai",
    modelId: "7f3d2e1a-4b5c-4d6e-8f9a-0b1c2d3e4f5a",
    input: 4,
    output: 20,
    cacheRead: 0.4,
    cacheWrite: 0,
  },
  "gpt-5.6-terra": {
    provider: "openai",
    modelId: "8a4e3f2b-5c6d-4e7f-9a0b-1c2d3e4f5a6b",
    input: 2,
    output: 12,
    cacheRead: 0.2,
    cacheWrite: 0,
  },
  "gpt-5.3-codex": {
    provider: "openai",
    modelId: "f1e2d3c4-b5a6-4789-8abc-0d1e2f3a4b5c",
    input: 1.75,
    output: 14,
    cacheRead: 0.175,
    cacheWrite: 0,
  },
  "gpt-5.4-mini": {
    provider: "openai",
    modelId: "4bf01a9f-663f-4302-a05c-b2b42c5348e3",
    input: 0.75,
    output: 4.5,
    cacheRead: 0.075,
    cacheWrite: 0,
  },
} as const satisfies Record<
  string,
  {
    provider: Provider;
    modelId: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  }
>;
type ModelName = keyof typeof MODELS;

type AgentUse = {
  agent: AgentName;
  weight: number;
  models: ReadonlyArray<readonly [ModelName, number]>;
};

type Profile = {
  slug: string;
  name: string;
  role: Role;
  team: string;
  keyName: string;
  /** Mean gateway requests on a working day. */
  perWorkday: number;
  /** Hours from UTC of the user's working day. */
  utcOffset: number;
  startHour: number;
  endHour: number;
  weekendProbability: number;
  agents: ReadonlyArray<AgentUse>;
  repos: ReadonlyArray<string>;
};

const PROFILES: ReadonlyArray<Profile> = [
  {
    slug: "maya.chen",
    name: "Maya Chen",
    role: "OWNER",
    team: "platform",
    keyName: "Maya – Claude Code",
    perWorkday: 80,
    utcOffset: -8,
    startHour: 8,
    endHour: 18,
    weekendProbability: 0.15,
    agents: [
      {
        agent: "claude-code",
        weight: 1,
        models: [
          ["claude-sonnet-4-6", 3],
          ["claude-opus-4-8", 1],
        ],
      },
    ],
    repos: ["acme-platform", "acme-infra"],
  },
  {
    slug: "priya.raman",
    name: "Priya Raman",
    role: "MEMBER",
    team: "platform",
    keyName: "Priya – Claude Code",
    perWorkday: 260,
    utcOffset: -8,
    startHour: 9,
    endHour: 20,
    weekendProbability: 0.35,
    agents: [
      {
        agent: "claude-code",
        weight: 1,
        models: [
          ["claude-opus-4-8", 3],
          ["claude-sonnet-4-6", 1],
        ],
      },
    ],
    repos: ["acme-platform", "acme-api"],
  },
  {
    slug: "daniel.okafor",
    name: "Daniel Okafor",
    role: "ADMIN",
    team: "infrastructure",
    keyName: "Daniel – Codex",
    perWorkday: 180,
    utcOffset: -5,
    startHour: 8,
    endHour: 18,
    weekendProbability: 0.1,
    agents: [
      {
        agent: "codex",
        weight: 1,
        models: [
          ["gpt-5.6-sol", 2],
          ["gpt-5.3-codex", 2],
        ],
      },
    ],
    repos: ["acme-infra", "acme-api"],
  },
  {
    slug: "amara.nwosu",
    name: "Amara Nwosu",
    role: "MEMBER",
    team: "backend",
    keyName: "Amara – agents",
    perWorkday: 170,
    utcOffset: 1,
    startHour: 9,
    endHour: 19,
    weekendProbability: 0.1,
    agents: [
      {
        agent: "claude-code",
        weight: 3,
        models: [
          ["claude-sonnet-4-6", 3],
          ["claude-opus-4-8", 1],
        ],
      },
      {
        agent: "codex",
        weight: 2,
        models: [["gpt-5.6-sol", 1]],
      },
    ],
    repos: ["acme-api", "acme-billing"],
  },
  {
    slug: "lukas.weber",
    name: "Lukas Weber",
    role: "MEMBER",
    team: "backend",
    keyName: "Lukas – Claude Code",
    perWorkday: 85,
    utcOffset: 1,
    startHour: 8,
    endHour: 17,
    weekendProbability: 0.05,
    agents: [
      {
        agent: "claude-code",
        weight: 1,
        models: [["claude-sonnet-4-6", 1]],
      },
    ],
    repos: ["acme-billing", "acme-api"],
  },
  {
    slug: "james.park",
    name: "James Park",
    role: "MEMBER",
    team: "data",
    keyName: "James – Codex",
    perWorkday: 80,
    utcOffset: -8,
    startHour: 9,
    endHour: 18,
    weekendProbability: 0.05,
    agents: [
      {
        agent: "codex",
        weight: 1,
        models: [
          ["gpt-5.6-terra", 3],
          ["gpt-5.4-mini", 1],
        ],
      },
    ],
    repos: ["acme-data-pipelines"],
  },
  {
    slug: "sofia.martinez",
    name: "Sofia Martinez",
    role: "MEMBER",
    team: "frontend",
    keyName: "Sofia – opencode",
    perWorkday: 65,
    utcOffset: -5,
    startHour: 9,
    endHour: 18,
    weekendProbability: 0.05,
    agents: [
      {
        agent: "opencode",
        weight: 1,
        models: [
          ["claude-sonnet-4-6", 2],
          ["gpt-5.6-terra", 1],
        ],
      },
    ],
    repos: ["acme-web"],
  },
  {
    slug: "tom.fischer",
    name: "Tom Fischer",
    role: "MEMBER",
    team: "frontend",
    keyName: "Tom – Claude Code",
    perWorkday: 30,
    utcOffset: 1,
    startHour: 9,
    endHour: 17,
    weekendProbability: 0,
    agents: [
      {
        agent: "claude-code",
        weight: 1,
        models: [
          ["claude-sonnet-4-6", 2],
          ["claude-haiku-4-5", 1],
        ],
      },
    ],
    repos: ["acme-web"],
  },
  {
    slug: "elena.rossi",
    name: "Elena Rossi",
    role: "MEMBER",
    team: "product",
    keyName: "Elena – opencode",
    perWorkday: 30,
    utcOffset: 1,
    startHour: 10,
    endHour: 17,
    weekendProbability: 0,
    agents: [
      {
        agent: "opencode",
        weight: 1,
        models: [
          ["claude-sonnet-4-6", 1],
          ["claude-haiku-4-5", 1],
          ["gpt-5.4-mini", 1],
        ],
      },
    ],
    repos: ["acme-docs"],
  },
  {
    slug: "noah.kim",
    name: "Noah Kim",
    role: "MEMBER",
    team: "design",
    keyName: "Noah – Claude Code",
    perWorkday: 20,
    utcOffset: -5,
    startHour: 10,
    endHour: 17,
    weekendProbability: 0,
    agents: [
      {
        agent: "claude-code",
        weight: 1,
        models: [
          ["claude-sonnet-4-6", 1],
          ["claude-haiku-4-5", 1],
        ],
      },
    ],
    repos: ["acme-web"],
  },
];

/** Reviews the PRs of the users above; its caller sets the PR author as user ID. */
const CI_BOT = {
  keyName: "CI code review bot",
  team: "ci",
  traceName: "ci-pr-review",
  model: "claude-sonnet-4-6" as ModelName,
  perWorkday: 16,
};

const TASKS = [
  "Fix the flaky retry test in the webhook dispatcher",
  "Add pagination to the invoices list endpoint",
  "Refactor the auth middleware to use the new session store",
  "Migrate the settings page form to the shared form components",
  "Investigate why the nightly export job times out",
  "Add an index for the orders lookup by customer and status",
  "Write unit tests for the currency conversion helpers",
  "Upgrade the Terraform AWS provider and fix the plan diff",
  "Implement rate limiting for the public API",
  "Remove the deprecated v1 billing endpoints",
  "Add dark mode support to the dashboard charts",
  "Fix the race condition in the job queue consumer",
  "Split the monolithic utils module into feature folders",
  "Add OpenTelemetry tracing to the checkout service",
  "Reduce the bundle size of the marketing site",
  "Backfill the missing customer region column",
  "Add a CLI command to rotate service credentials",
  "Fix timezone handling in the weekly report email",
] as const;

const TOOLS = ["Read", "Edit", "Bash", "Grep", "Glob", "Write"] as const;

const AGENT_API_FORMAT: Record<AgentName, Record<Provider, string>> = {
  "claude-code": {
    anthropic: "anthropic.messages",
    openai: "openai.chat-completions",
  },
  codex: { anthropic: "anthropic.messages", openai: "openai.responses" },
  opencode: {
    anthropic: "anthropic.messages",
    openai: "openai.chat-completions",
  },
};

const USER_AGENT: Record<AgentName, string> = {
  "claude-code": "claude-cli/2.1.42 (external, cli)",
  codex: "codex_cli_rs/0.58.0",
  opencode: "opencode/1.0.84",
};

const hex = (input: string, length: number) =>
  createHash("sha256").update(input).digest("hex").slice(0, length);

const uuidFrom = (input: string) => {
  const h = hex(input, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const emailOf = (profile: Pick<Profile, "slug">) => `${profile.slug}@acme.com`;

const pickWeighted = <T>(
  rng: Rng,
  items: ReadonlyArray<T>,
  weight: (item: T) => number,
): T => {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
};

type Usage = {
  input: number;
  output: number;
  input_cached_tokens?: number;
  input_cache_creation?: number;
  output_reasoning_tokens?: number;
};

const toUsageAndCost = (model: ModelName, usage: Usage) => {
  const price = MODELS[model];
  const usageDetails: Record<string, number> = { ...usage };
  const total = Object.values(usageDetails).reduce((a, b) => a + b, 0);
  const costDetails: Record<string, number> = {
    input: (usage.input * price.input) / 1e6,
    output: (usage.output * price.output) / 1e6,
  };
  if (usage.input_cached_tokens !== undefined) {
    costDetails.input_cached_tokens =
      (usage.input_cached_tokens * price.cacheRead) / 1e6;
  }
  if (usage.input_cache_creation !== undefined) {
    costDetails.input_cache_creation =
      (usage.input_cache_creation * price.cacheWrite) / 1e6;
  }
  if (usage.output_reasoning_tokens !== undefined) {
    costDetails.output_reasoning_tokens =
      (usage.output_reasoning_tokens * price.output) / 1e6;
  }
  const totalCost = Object.values(costDetails).reduce((a, b) => a + b, 0);
  return {
    usage: { ...usageDetails, total },
    cost: { ...costDetails, total: totalCost },
  };
};

type GatewayKey = {
  id: string;
  name: string;
  team: string;
  ownerUserId: string | null;
};

type RequestSpec = {
  key: GatewayKey;
  userId: string;
  agent: AgentName | null;
  traceName: string;
  sessionId: string | null;
  traceId: string;
  spanKey: string;
  model: ModelName;
  task: string;
  step: number;
  contextTokens: number;
  sideRequest: boolean;
  startTime: number;
  tags: string[];
};

type Failure = {
  status: number;
  message: string;
  origin: string;
  type: string;
};

const failureFor = (roll: number, provider: Provider): Failure | undefined => {
  if (roll < 0.004) {
    return {
      status: 504,
      message: "Provider response timed out",
      origin: "provider_transport",
      type: "timeout",
    };
  }
  if (roll < 0.009) {
    return {
      status: 429,
      message:
        provider === "anthropic"
          ? "Provider HTTP error (429): rate_limit_error: Number of request tokens has exceeded your per-minute rate limit"
          : "Provider HTTP error (429): Rate limit reached for requests",
      origin: "provider",
      type: "rate_limited",
    };
  }
  if (roll >= 0.013) return undefined;
  return provider === "anthropic"
    ? {
        status: 529,
        message: "Provider HTTP error (529): overloaded_error: Overloaded",
        origin: "provider",
        type: "overloaded",
      }
    : {
        status: 500,
        message:
          "Provider HTTP error (500): The server had an error while processing your request",
        origin: "provider",
        type: "server_error",
      };
};

const warningFor = (provider: Provider) =>
  provider === "anthropic"
    ? "Client cancelled the response"
    : "Provider response incomplete";

const levelOf = (failure: Failure | undefined, warning: string | undefined) => {
  if (failure) return "ERROR";
  if (warning) return "WARNING";
  return "DEFAULT";
};

/** Anthropic reports cache reads and writes; OpenAI cached input and reasoning. */
const usageFor = (spec: RequestSpec, provider: Provider, rng: Rng): Usage => {
  if (spec.sideRequest) {
    return { input: 200 + rng.int(0, 1800), output: 12 + rng.int(0, 90) };
  }
  if (provider === "anthropic") {
    const fresh = 1 + rng.int(0, 600);
    if (spec.step === 0) {
      return {
        input: fresh + rng.int(500, 3_000),
        input_cache_creation: spec.contextTokens,
        input_cached_tokens: 0,
        output: 120 + rng.int(0, 900),
      };
    }
    return {
      input: fresh,
      input_cached_tokens: spec.contextTokens,
      input_cache_creation: 400 + rng.int(0, 5_500),
      output: 80 + Math.floor(rng.next() ** 2 * 4_000),
    };
  }
  return {
    input: 600 + rng.int(0, 5_000),
    input_cached_tokens:
      spec.step === 0 ? 0 : Math.floor(spec.contextTokens / 128) * 128,
    output: 60 + Math.floor(rng.next() ** 2 * 2_000),
    output_reasoning_tokens:
      spec.model === "gpt-5.4-mini"
        ? rng.int(0, 400)
        : 150 + Math.floor(rng.next() ** 1.5 * 3_500),
  };
};

const durationFor = (
  failure: Failure | undefined,
  ttftMs: number,
  usage: Usage,
  rng: Rng,
) => {
  if (failure?.type === "timeout") return 120_000;
  if (failure) return 150 + rng.int(0, 900);
  const generated = usage.output + (usage.output_reasoning_tokens ?? 0);
  return ttftMs + Math.floor(generated * (8 + rng.int(0, 14)));
};

const requestInput = (spec: RequestSpec, tool: string) => {
  if (spec.sideRequest) {
    return {
      model: spec.model,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Write a 5-10 word title for this coding session: "${spec.task}"`,
        },
      ],
    };
  }
  const prompt = { role: "user", content: spec.task };
  return {
    model: spec.model,
    messages:
      spec.step === 0
        ? [prompt]
        : [
            prompt,
            {
              role: "tool",
              name: tool,
              content: `${tool} completed (step ${spec.step}).`,
            },
          ],
  };
};

const requestOutput = (spec: RequestSpec) => {
  if (spec.sideRequest) {
    return {
      role: "assistant",
      content: spec.task.split(" ").slice(0, 6).join(" "),
    };
  }
  if (spec.step % 4 === 3) {
    return {
      role: "assistant",
      content: `I've updated the implementation for "${spec.task.toLowerCase()}". Running the tests next.`,
      tool_calls: [],
    };
  }
  const next = TOOLS[(spec.step + 1) % TOOLS.length];
  return {
    role: "assistant",
    content: `Calling ${next} to continue.`,
    tool_calls: [{ name: next }],
  };
};

const buildEvent = (
  environment: string,
  spec: RequestSpec,
  rng: Rng,
): { event: EventRecordInsertType; cost: number } => {
  const price = MODELS[spec.model];
  const provider: Provider = price.provider;
  const apiFormat = spec.agent
    ? AGENT_API_FORMAT[spec.agent][provider]
    : "anthropic.messages";

  const roll = rng.next();
  const failure = failureFor(roll, provider);
  const warning = !failure && roll > 0.995 ? warningFor(provider) : undefined;
  const usage = usageFor(spec, provider, rng);
  if (warning) usage.output = Math.floor(usage.output / 3);

  const { usage: usageDetails, cost: costDetails } = failure
    ? { usage: {}, cost: {} }
    : toUsageAndCost(spec.model, usage);

  const ttftMs = failure?.type === "timeout" ? 0 : 450 + rng.int(0, 2_200);
  const durationMs = durationFor(failure, ttftMs, usage, rng);
  const spanId = hex(`span:${spec.spanKey}`, 16);
  const input = requestInput(spec, TOOLS[rng.int(0, TOOLS.length - 1)]);
  const output = failure ? null : requestOutput(spec);

  const metadata: Record<string, string> = {
    [AI_GATEWAY_KEY_ID_METADATA_KEY]: spec.key.id,
    "langfuse.gateway.api_key.name": spec.key.name,
    "langfuse.gateway.api_key.metadata.team": spec.key.team,
    "langfuse.gateway.request.api_format": apiFormat,
    "langfuse.gateway.request.id": `gwreq_${hex(`req:${spec.spanKey}`, 24)}`,
    "langfuse.gateway.upstream.request.id": `req_${hex(`up:${spec.spanKey}`, 24)}`,
    "langfuse.gateway.response.status_code": String(failure?.status ?? 200),
    "langfuse.gateway.connection.provider": provider,
    "langfuse.gateway.connection.name":
      provider === "anthropic" ? "Anthropic" : "OpenAI",
    "langfuse.gateway.model.requested": spec.model,
    "langfuse.gateway.ingestion.mode": "full",
  };
  if (spec.key.ownerUserId) {
    metadata[AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY] = spec.key.ownerUserId;
  }
  if (spec.agent) {
    metadata["agent.name"] = spec.agent;
    metadata["langfuse.gateway.client.user_agent"] = USER_AGENT[spec.agent];
    if (spec.sessionId) {
      metadata["agent.session_id"] = spec.sessionId.slice(
        spec.agent.length + 1,
      );
    }
  }
  if (failure) {
    metadata["langfuse.gateway.error.origin"] = failure.origin;
    metadata["langfuse.gateway.error.type"] = failure.type;
  }
  const metadataNames = Object.keys(metadata).sort();

  const event = createEvent({
    project_id: INGESTION_PROJECT_ID,
    trace_id: spec.traceId,
    span_id: spanId,
    id: spanId,
    parent_span_id: "",
    is_app_root: true,
    name: apiFormat,
    trace_name: spec.traceName,
    type: "GENERATION",
    environment,
    level: levelOf(failure, warning),
    status_message: failure?.message ?? warning ?? null,
    version: null,
    release: null,
    tags: spec.tags,
    user_id: spec.userId,
    session_id: spec.sessionId,
    public: false,
    bookmarked: false,
    input: JSON.stringify(input),
    output: output ? JSON.stringify(output) : null,
    provided_model_name: spec.model,
    model_id: failure ? null : price.modelId,
    model_parameters: JSON.stringify({
      max_tokens: spec.sideRequest ? 512 : 32_000,
    }),
    provided_usage_details: usageDetails,
    usage_details: usageDetails,
    provided_cost_details: costDetails,
    cost_details: costDetails,
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,
    metadata_names: metadataNames,
    metadata_values: metadataNames.map((name) => metadata[name]),
    ingestion_api_key: spec.key.id,
    service_name: AI_GATEWAY_SERVICE_NAME,
    scope_name: AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME,
    start_time: spec.startTime,
    end_time: spec.startTime + durationMs,
    completion_start_time: failure ? null : spec.startTime + ttftMs,
    created_at: spec.startTime + durationMs,
    updated_at: spec.startTime + durationMs,
    event_ts: spec.startTime + durationMs,
    event_bytes: 0,
    source: "otel",
  });
  return {
    event,
    cost: (costDetails as Record<string, number>).total ?? 0,
  };
};

/** Requests of one user on one day, in agent sessions within working hours. */
const userDay = (params: {
  seed: number;
  idPrefix: string;
  profile: Profile;
  profileIndex: number;
  key: GatewayKey;
  dayStart: number;
  day: number;
}): RequestSpec[] => {
  const { profile, dayStart } = params;
  const rng = new Rng(
    jitter(params.seed, params.profileIndex * 10_000 + params.day, 2 ** 31),
  );
  const weekday = new Date(dayStart).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  if (weekend && rng.next() >= profile.weekendProbability) return [];
  // An occasional day off or out sick.
  if (!weekend && rng.next() < 0.06) return [];
  const target = Math.round(
    profile.perWorkday * (weekend ? 0.25 : 0.55 + rng.next() * 0.9),
  );

  const workStart = dayStart + (profile.startHour - profile.utcOffset) * HOUR;
  const workEnd = dayStart + (profile.endHour - profile.utcOffset) * HOUR;
  const specs: RequestSpec[] = [];
  let t = workStart + rng.int(0, 90) * 60_000;
  let session = 0;
  while (specs.length < target && t < workEnd) {
    const use = pickWeighted(rng, profile.agents, (a) => a.weight);
    const [model] = pickWeighted(rng, use.models, ([, w]) => w);
    const task = TASKS[rng.int(0, TASKS.length - 1)];
    const repo = profile.repos[rng.int(0, profile.repos.length - 1)];
    const sessionKey = `${params.idPrefix}:${profile.slug}:${params.day}:${session}`;
    const sessionUuid = uuidFrom(`session:${sessionKey}`);
    const length = Math.min(target - specs.length, 6 + rng.int(0, 44));
    let context = 26_000 + rng.int(0, 20_000);
    let turnTraceId = hex(`turn:${sessionKey}:0`, 32);
    for (let step = 0; step < length && t < workEnd + 2 * HOUR; step++) {
      if (use.agent !== "claude-code" && step > 0 && rng.next() < 0.25) {
        turnTraceId = hex(`turn:${sessionKey}:${step}`, 32);
      }
      const spanKey = `${sessionKey}:${step}`;
      const base = {
        key: params.key,
        userId: emailOf(profile),
        agent: use.agent,
        traceName: use.agent,
        sessionId: `${use.agent}:${sessionUuid}`,
        task,
        step,
        tags: [`repo:${repo}`, `team:${profile.team}`],
      };
      specs.push({
        ...base,
        traceId:
          use.agent === "claude-code"
            ? hex(`trace:${spanKey}`, 32)
            : turnTraceId,
        spanKey,
        model,
        contextTokens: context,
        sideRequest: false,
        startTime: t,
      });
      // Claude Code sends short Haiku requests (titles, summaries) alongside.
      if (use.agent === "claude-code" && (step === 0 || rng.next() < 0.06)) {
        specs.push({
          ...base,
          traceId: hex(`trace:${spanKey}:side`, 32),
          spanKey: `${spanKey}:side`,
          model: "claude-haiku-4-5",
          contextTokens: 0,
          sideRequest: true,
          startTime: t + 300 + rng.int(0, 700),
        });
      }
      context = Math.min(context + 1_500 + rng.int(0, 4_500), 190_000);
      t += 6_000 + Math.floor(rng.next() ** 2 * 110_000);
    }
    session++;
    t += (8 + rng.int(0, 70)) * 60_000;
  }
  return specs;
};

const ciBotDay = (params: {
  seed: number;
  idPrefix: string;
  key: GatewayKey;
  dayStart: number;
  day: number;
}): RequestSpec[] => {
  const weekday = new Date(params.dayStart).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];
  const rng = new Rng(jitter(params.seed, 900_000 + params.day, 2 ** 31));
  const count = Math.round(CI_BOT.perWorkday * (0.6 + rng.next() * 0.8));
  return Array.from({ length: count }, (_, i) => {
    const author = PROFILES[rng.int(0, PROFILES.length - 1)];
    const spanKey = `${params.idPrefix}:ci:${params.day}:${i}`;
    return {
      key: params.key,
      userId: emailOf(author),
      agent: null,
      traceName: CI_BOT.traceName,
      sessionId: null,
      traceId: hex(`trace:${spanKey}`, 32),
      spanKey,
      model: CI_BOT.model,
      task: `Review pull request #${4_100 + params.day * 20 + i} in ${author.repos[0]}`,
      step: 0,
      contextTokens: 8_000 + rng.int(0, 30_000),
      sideRequest: false,
      startTime:
        params.dayStart + (14 + rng.int(0, 9)) * HOUR + rng.int(0, HOUR),
      tags: [`repo:${author.repos[0]}`, "ci"],
    };
  });
};

const ensureOrganization = async (now: number) => {
  const createdAt = new Date(now - 45 * DAY);
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      name: "Acme",
      cloudConfig: { plan: "Team" },
      aiFeaturesEnabled: true,
      createdAt,
    },
    update: {},
  });
  const passwordHash = await hash(PASSWORD, 12);
  const users: Array<{
    profile: Profile;
    userId: string;
    membershipId: string;
  }> = [];
  for (const [i, profile] of PROFILES.entries()) {
    const joinedAt = new Date(now - (44 - i) * DAY);
    const user = await prisma.user.upsert({
      where: { email: emailOf(profile) },
      create: {
        email: emailOf(profile),
        name: profile.name,
        password: passwordHash,
        v4BetaEnabled: true,
        createdAt: joinedAt,
      },
      update: {},
      select: { id: true },
    });
    const membership = await prisma.organizationMembership.upsert({
      where: { orgId_userId: { orgId: ORG_ID, userId: user.id } },
      create: {
        orgId: ORG_ID,
        userId: user.id,
        role: profile.role,
        createdAt: joinedAt,
      },
      update: {},
      select: { id: true },
    });
    users.push({ profile, userId: user.id, membershipId: membership.id });
  }
  const owner = users[0];

  await prisma.project.upsert({
    where: { id: INGESTION_PROJECT_ID },
    create: {
      id: INGESTION_PROJECT_ID,
      name: "AI Gateway",
      orgId: ORG_ID,
      createdAt,
    },
    update: {},
  });
  await prisma.projectMembership.upsert({
    where: {
      projectId_userId: {
        projectId: INGESTION_PROJECT_ID,
        userId: owner.userId,
      },
    },
    create: {
      projectId: INGESTION_PROJECT_ID,
      userId: owner.userId,
      orgMembershipId: owner.membershipId,
      role: "OWNER",
    },
    update: {},
  });
  await prisma.gatewayConfig.upsert({
    where: { organizationId: ORG_ID },
    create: {
      organizationId: ORG_ID,
      defaultIngestionProjectId: INGESTION_PROJECT_ID,
      ingestionMode: "FULL",
    },
    update: {},
  });
  const modelsOf = (provider: Provider) =>
    (Object.keys(MODELS) as ModelName[]).filter(
      (name) => MODELS[name].provider === provider,
    );
  for (const connection of [
    {
      id: `${ORG_ID}-anthropic`,
      name: "Anthropic",
      provider: "ANTHROPIC" as const,
      secret: "sk-ant-acme-demo-not-a-real-key",
      models: modelsOf("anthropic"),
    },
    {
      id: `${ORG_ID}-openai`,
      name: "OpenAI",
      provider: "OPENAI" as const,
      secret: "sk-proj-acme-demo-not-a-real-key",
      models: modelsOf("openai"),
    },
  ]) {
    await prisma.gatewayAiConnection.upsert({
      where: { id: connection.id },
      create: {
        id: connection.id,
        organizationId: ORG_ID,
        name: connection.name,
        provider: connection.provider,
        encryptedCredential: encrypt(connection.secret),
        displaySecret: getDisplaySecretKey(connection.secret),
        createdById: owner.userId,
        status: "ENABLED",
        allowedModels: connection.models,
        createdAt,
      },
      update: {},
    });
  }
  return users;
};

const ensureKey = async (params: {
  publicKeySuffix: string;
  name: string;
  team: string;
  ownerUserId: string | null;
  createdBy: string;
  createdAt: Date;
}): Promise<GatewayKey> => {
  const publicKey = `pk-lf-gateway-acme-${params.publicKeySuffix}`;
  const found = await prisma.apiKey.findUnique({
    where: { publicKey },
    select: { id: true, orgId: true },
  });
  if (found && found.orgId !== ORG_ID) {
    throw new SeedError(
      `Gateway key ${publicKey} belongs to another organization`,
      "delete that API key, then re-run",
    );
  }
  const id =
    found?.id ??
    (
      await createApiKey(prisma, {
        tenant: OrganizationId(ORG_ID),
        scope: params.ownerUserId
          ? UserId(params.ownerUserId)
          : OrganizationId(ORG_ID),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy:
          params.createdBy === "system" ? "system" : UserId(params.createdBy),
        name: params.name,
        predefinedKeys: {
          publicKey,
          secretKey: `sk-lf-gateway-acme-${params.publicKeySuffix}`,
        },
      })
    ).id;
  if (!found) {
    await prisma.apiKey.update({
      where: { id },
      data: { createdAt: params.createdAt },
    });
  }
  await prisma.gatewayApiKeyAssociation.upsert({
    where: { apiKeyId: id },
    create: { apiKeyId: id, metadata: { team: params.team } },
    update: {},
  });
  return {
    id,
    name: params.name,
    team: params.team,
    ownerUserId: params.ownerUserId,
  };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const days = params["days"] as number;
  if (days < 1 || days > 90) {
    throw new SeedError(
      `--days must be between 1 and 90, got ${days}`,
      "pass e.g. --days 30",
    );
  }
  const links = [
    `${ctx.baseUrl}/organization/${ORG_ID}/settings/ai-gateway-analytics`,
    `${ctx.baseUrl}/project/${INGESTION_PROJECT_ID}/traces`,
  ];
  const summaryBase = {
    scenario: "gateway-demo",
    target: "clickhouse" as const,
    params,
    projectId: INGESTION_PROJECT_ID,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    links,
  };
  if (ctx.dryRun) {
    return {
      ...summaryBase,
      counts: { users: PROFILES.length, keys: PROFILES.length + 1 },
      verified: {},
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const now = Date.now();
  const users = await ensureOrganization(now);
  const keys: GatewayKey[] = [];
  for (const [i, { profile, userId }] of users.entries()) {
    keys.push(
      await ensureKey({
        publicKeySuffix: profile.slug.replace(".", "-"),
        name: profile.keyName,
        team: profile.team,
        ownerUserId: userId,
        createdBy: userId,
        createdAt: new Date(now - (42 - i) * DAY),
      }),
    );
  }
  const ciKey = await ensureKey({
    publicKeySuffix: "ci-review-bot",
    name: CI_BOT.keyName,
    team: CI_BOT.team,
    ownerUserId: null,
    createdBy: users[0].userId,
    createdAt: new Date(now - 38 * DAY),
  });

  const todayStart = utcDayStartMs();
  const windowStart = todayStart - (days - 1) * DAY;
  const totals = {
    events: 0,
    errors: 0,
    costUsd: 0,
    byModel: {} as Record<string, number>,
    byUser: {} as Record<string, number>,
  };
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = todayStart - d * DAY;
    const dayIndex = Math.round(dayStart / DAY);
    const specs = [
      ...PROFILES.flatMap((profile, profileIndex) =>
        userDay({
          seed: ctx.seed,
          idPrefix: ctx.idPrefix,
          profile,
          profileIndex,
          key: keys[profileIndex],
          dayStart,
          day: dayIndex,
        }),
      ),
      ...ciBotDay({
        seed: ctx.seed,
        idPrefix: ctx.idPrefix,
        key: ciKey,
        dayStart,
        day: dayIndex,
      }),
    ].filter((spec) => spec.startTime >= windowStart && spec.startTime < now);

    const events: EventRecordInsertType[] = [];
    for (const spec of specs) {
      const rng = new Rng(parseInt(hex(`rng:${spec.spanKey}`, 8), 16));
      const { event, cost } = buildEvent(ctx.environment, spec, rng);
      events.push(event);
      totals.events++;
      if (event.level === "ERROR") totals.errors++;
      totals.costUsd += cost;
      totals.byModel[spec.model] = (totals.byModel[spec.model] ?? 0) + cost;
      totals.byUser[spec.userId] = (totals.byUser[spec.userId] ?? 0) + cost;
    }
    for (const batch of chunk(events, 500)) {
      await createEventsCh(batch);
    }
    ctx.log(`day -${d}: ${events.length} gateway requests`);
  }

  const verified = {
    events: await countRows(
      "events_core",
      `project_id = {projectId: String} AND service_name = {serviceName: String} AND start_time >= {windowStart: DateTime64(3)} AND is_deleted = 0`,
      {
        projectId: INGESTION_PROJECT_ID,
        serviceName: AI_GATEWAY_SERVICE_NAME,
        windowStart: new Date(windowStart)
          .toISOString()
          .replace("T", " ")
          .replace("Z", ""),
      },
      "uniqExact(span_id)",
    ),
  };
  if (verified.events < totals.events) {
    throw new SeedError(
      `Readback mismatch: expected at least ${totals.events} gateway events, found ${verified.events}`,
    );
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  ctx.log(
    `seeded ${totals.events} requests, ${totals.errors} errors, $${round(totals.costUsd)} total`,
  );
  return {
    ...summaryBase,
    counts: {
      users: PROFILES.length,
      keys: keys.length + 1,
      events: totals.events,
      errors: totals.errors,
      costCents: Math.round(totals.costUsd * 100),
      ...Object.fromEntries(
        Object.entries(totals.byModel).map(([model, cost]) => [
          `costCents:${model}`,
          Math.round(cost * 100),
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(totals.byUser).map(([user, cost]) => [
          `costCents:${user}`,
          Math.round(cost * 100),
        ]),
      ),
    },
    verified,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const gatewayDemoScenario: ScenarioDefinition = {
  name: "gateway-demo",
  description:
    'Acme organization demo for the AI Gateway: ten @acme.com users (password "password") with gateway keys, a CI service key, OpenAI and Anthropic connections, and realistic coding-agent traffic (Claude Code, Codex, opencode) over the last --days days ending now, priced with Langfuse default model prices. Writes its own organization and ingestion project; --project is ignored. Runs automatically after the requested scenario in PR previews.',
  supportsV4: true,
  flags: [
    {
      flag: "days",
      type: "number",
      default: 30,
      description: "days of traffic, ending now (today included)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "check the v4 events tables before writing (the scenario only writes events)",
    },
  ],
  run,
};
