import crypto from "crypto";
import { prisma } from "../../../src/db";
import { ObservationType } from "../../../src/domain";
import {
  convertCallsToArrays,
  convertDefinitionsToMap,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  extractToolsFromObservation,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink, tracesListLink } from "./verify";

/**
 * Curated traces for the observability docs videos, seeded into the
 * docs-demo project (`--project docs-demo`). Every trace is handcrafted and
 * deterministic; ids are hex digests of `--id-prefix` so they read like
 * production ids in the trace header.
 *
 * `links` order (stable): qa-answer (RAG walkthrough), summarize-call (PII
 * redaction), triage-graph (DEBUG-level spans), route-ticket (generation with
 * an unpriced model), then the background traffic for the traces table; the
 * last link is the traces list.
 *
 * Re-running also deletes the project-level `grok-4-fast` model definition so
 * the "create a custom model from a generation" flow starts clean.
 */

const UNPRICED_MODEL = "grok-4-fast";
const QA_PROMPT_NAME = "qa-answer-with-context-chat";

/** USD per token */
const PRICES: Record<string, Record<string, number>> = {
  "gpt-4.1": { input: 2e-6, input_cached_tokens: 5e-7, output: 8e-6 },
  "gpt-4.1-mini": { input: 4e-7, input_cached_tokens: 1e-7, output: 1.6e-6 },
};

type ObsSpec = {
  key: string;
  parentKey: string | null;
  type: ObservationType;
  name: string;
  /** ms offsets from the trace timestamp */
  start: number;
  end: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, string>;
  model?: string;
  usage?: Record<string, number>;
  ttft?: number;
  modelParameters?: Record<string, unknown>;
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
  statusMessage?: string;
  prompt?: boolean;
};

type TraceSpec = {
  key: string;
  name: string;
  /** minutes after 08:00 UTC today */
  minute: number;
  userId: string;
  sessionId?: string;
  release?: string;
  tags: string[];
  metadata?: Record<string, string>;
  input: unknown;
  output: unknown;
  observations: ObsSpec[];
};

// ---------------------------------------------------------------------------
// 1. RAG chat answer (observability get-started walkthrough)
// ---------------------------------------------------------------------------

const QA_QUESTION =
  "Can you show me how to retry fleet API calls in Python when I hit the rate limit?";

const QA_CONTEXT = [
  {
    id: "kb-rate-limits",
    title: "API rate limits",
    score: 0.91,
    text: "The Fleet API allows 600 requests per minute per workspace. Requests above the limit return HTTP 429 with a Retry-After header in seconds.",
  },
  {
    id: "kb-errors",
    title: "Error handling",
    score: 0.84,
    text: "Retry 429 and 5xx responses with exponential backoff. Never retry 4xx responses other than 429.",
  },
  {
    id: "kb-python-sdk",
    title: "Python quickstart",
    score: 0.79,
    text: "Authenticate with an API key in the Authorization header: `Bearer <ACME_API_KEY>`. Base URL: https://api.acme-robotics.io/v2.",
  },
];

const QA_SYSTEM_PROMPT =
  "You are Acme Robotics' help-center assistant. Answer developer questions " +
  "using only the provided context. Cite the article titles you used. If the " +
  "context does not cover the question, say so and point to support.\n\n" +
  "Context:\n" +
  QA_CONTEXT.map((doc) => `## ${doc.title}\n${doc.text}`).join("\n\n");

const QA_HISTORY: { role: "user" | "assistant"; content: string }[] = [
  {
    role: "user",
    content: "Hi! I'm integrating the Fleet API for our warehouse robots.",
  },
  {
    role: "assistant",
    content:
      "Welcome! I can help with authentication, robot status, missions and webhooks. What are you building?",
  },
  {
    role: "user",
    content: "A dashboard that shows the battery level of every robot.",
  },
  {
    role: "assistant",
    content:
      "Use `GET /robots` for the list and `GET /robots/{id}/telemetry` for battery, position and error codes.",
  },
  { role: "user", content: "Is there a way to get updates without polling?" },
  {
    role: "assistant",
    content:
      "Yes — subscribe to the `robot.telemetry` webhook. Acme sends an event whenever battery changes by 5% or more.",
  },
  { role: "user", content: "How do I verify the webhook signature?" },
  {
    role: "assistant",
    content:
      "Compute an HMAC-SHA256 of the raw body with your webhook secret and compare it to the `Acme-Signature` header.",
  },
  { role: "user", content: "Got it. Which API version should I target?" },
  {
    role: "assistant",
    content:
      "Target `v2`. `v1` is deprecated and stops accepting requests on 2027-01-31.",
  },
  { role: "user", content: "Can one API key access several warehouses?" },
  {
    role: "assistant",
    content:
      "Keys are scoped to a workspace. Add the warehouses to the same workspace, or create one key per workspace.",
  },
  {
    role: "user",
    content: "Our backfill script calls /telemetry for 2,000 robots at once.",
  },
  {
    role: "assistant",
    content:
      "That will exceed the 600 requests/minute limit. Batch the calls or use `GET /telemetry?robot_ids=` with up to 100 ids.",
  },
  { role: "user", content: "We still get some 429s during peak hours." },
  {
    role: "assistant",
    content:
      "That is expected under bursty load. Respect the `Retry-After` header and retry with exponential backoff.",
  },
  { role: "user", content: QA_QUESTION },
];

const QA_ANSWER =
  "Sure! The Fleet API returns **HTTP 429** with a `Retry-After` header when you " +
  "exceed 600 requests per minute. Retry those responses (and 5xx errors) with " +
  "exponential backoff:\n\n" +
  "```python\n" +
  "import os\nimport time\n\nimport requests\n\n" +
  'BASE_URL = "https://api.acme-robotics.io/v2"\n' +
  'HEADERS = {"Authorization": f"Bearer {os.environ[\'ACME_API_KEY\']}"}\n\n\n' +
  "def get_with_retry(path, max_retries=5):\n" +
  "    for attempt in range(max_retries):\n" +
  '        response = requests.get(f"{BASE_URL}{path}", headers=HEADERS)\n' +
  "        if response.status_code != 429 and response.status_code < 500:\n" +
  "            response.raise_for_status()\n" +
  "            return response.json()\n" +
  '        wait = float(response.headers.get("Retry-After", 2**attempt))\n' +
  "        time.sleep(wait)\n" +
  '    raise RuntimeError(f"Gave up on {path} after {max_retries} retries")\n\n\n' +
  'telemetry = get_with_retry("/robots/rb-0042/telemetry")\n' +
  "```\n\n" +
  "Other 4xx errors are not retried, since repeating them will not succeed. " +
  "Sources: *API rate limits*, *Error handling*, *Python quickstart*.";

const qaTrace: TraceSpec = {
  key: "qa",
  name: "qa-answer",
  minute: 95,
  userId: "dev-lena.park",
  sessionId: "chat-fleet-api-onboarding",
  release: "help-center-v2.4.1",
  tags: ["rag", "with-context"],
  metadata: { channel: "help-center", locale: "en-US" },
  input: { question: QA_QUESTION },
  output: { answer: QA_ANSWER },
  observations: [
    {
      key: "retrieval",
      parentKey: null,
      type: "RETRIEVER",
      name: "retrieval",
      start: 12,
      end: 486,
      input: { query: QA_QUESTION, top_k: 3 },
      output: {
        documents: QA_CONTEXT.map(({ id, title, score }) => ({
          id,
          title,
          score,
        })),
      },
    },
    {
      key: "embed",
      parentKey: "retrieval",
      type: "EMBEDDING",
      name: "embed-query",
      start: 18,
      end: 171,
      model: "text-embedding-3-small",
      usage: { input: 21 },
      input: QA_QUESTION,
      output: { dimensions: 1536 },
    },
    {
      key: "vector-store",
      parentKey: "retrieval",
      type: "SPAN",
      name: "vector-store",
      start: 176,
      end: 402,
      input: { index: "help-center-articles", top_k: 3 },
      output: QA_CONTEXT,
      metadata: { provider: "pgvector" },
    },
    {
      key: "context",
      parentKey: "retrieval",
      type: "SPAN",
      name: "context-encoding",
      start: 405,
      end: 480,
      input: { documents: QA_CONTEXT.map((doc) => doc.id) },
      output: { context_tokens: 214, truncated: false },
    },
    {
      key: "fetch-prompt",
      parentKey: null,
      type: "SPAN",
      name: "fetch-prompt-from-langfuse",
      start: 490,
      end: 538,
      input: { name: QA_PROMPT_NAME, label: "production" },
      output: { version: 1, cached: true },
    },
    {
      key: "generation",
      parentKey: null,
      type: "GENERATION",
      name: "generation",
      start: 545,
      end: 4712,
      model: "gpt-4.1",
      usage: { input: 9856, input_cached_tokens: 7168, output: 1214 },
      ttft: 388,
      modelParameters: { temperature: 0.2, max_tokens: 800 },
      prompt: true,
      input: [{ role: "system", content: QA_SYSTEM_PROMPT }, ...QA_HISTORY],
      output: { role: "assistant", content: QA_ANSWER },
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. PII redaction around a generation (security & guardrails page)
// ---------------------------------------------------------------------------

const TRANSCRIPT =
  "Agent: Thanks for calling Acme Robotics support, who am I speaking with?\n" +
  "Customer: This is Jane Doe from Northwind Logistics. My email is jane.doe@northwind.example.\n" +
  "Customer: Robot RB-0042 stopped mid-mission twice today and shows error E-217.\n" +
  "Agent: I see the firmware is 4.2.0. Updating to 4.2.3 fixes E-217. I'll schedule it tonight.\n" +
  "Customer: Great, please call me back at +1 415 555 0134 once it's done.";

const REDACTED_TRANSCRIPT = TRANSCRIPT.replace(
  "Jane Doe",
  "[REDACTED_PERSON_1]",
)
  .replace("jane.doe@northwind.example", "[REDACTED_EMAIL_1]")
  .replace("+1 415 555 0134", "[REDACTED_PHONE_1]");

const REDACTED_SUMMARY =
  "[REDACTED_PERSON_1] (Northwind Logistics) reported robot RB-0042 stopping " +
  "mid-mission with error E-217 on firmware 4.2.0. The agent scheduled an " +
  "overnight update to 4.2.3, which fixes the issue, and will call back at " +
  "[REDACTED_PHONE_1] when it is done.";

const SUMMARY = REDACTED_SUMMARY.replace(
  "[REDACTED_PERSON_1]",
  "Jane Doe",
).replace("[REDACTED_PHONE_1]", "+1 415 555 0134");

const piiTrace: TraceSpec = {
  key: "pii",
  name: "summarize-call",
  minute: 80,
  userId: "agent-console",
  release: "call-notes-v1.8.0",
  tags: ["pii-redaction"],
  metadata: { ticket: "SUP-48213" },
  input: { transcript: TRANSCRIPT },
  output: { summary: SUMMARY },
  observations: [
    {
      key: "anonymize",
      parentKey: null,
      type: "GUARDRAIL",
      name: "anonymize",
      start: 10,
      end: 148,
      input: { text: TRANSCRIPT },
      output: {
        text: REDACTED_TRANSCRIPT,
        entities: ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"],
      },
      metadata: { analyzer: "presidio", language: "en" },
    },
    {
      key: "generation",
      parentKey: null,
      type: "GENERATION",
      name: "summarize",
      start: 156,
      end: 2391,
      model: "gpt-4.1",
      usage: { input: 412, output: 96 },
      ttft: 302,
      modelParameters: { temperature: 0 },
      input: [
        {
          role: "system",
          content: "Summarize the support call transcript in 2-3 sentences.",
        },
        { role: "user", content: REDACTED_TRANSCRIPT },
      ],
      output: { role: "assistant", content: REDACTED_SUMMARY },
    },
    {
      key: "deanonymize",
      parentKey: null,
      type: "SPAN",
      name: "deanonymize",
      start: 2398,
      end: 2431,
      input: { text: REDACTED_SUMMARY },
      output: { text: SUMMARY },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. LangGraph-style agent with DEBUG-level internals (log levels page)
// ---------------------------------------------------------------------------

const TRIAGE_QUESTION = "Where is my replacement battery for robot RB-0042?";

const triageTrace: TraceSpec = {
  key: "triage",
  name: "triage-graph",
  minute: 65,
  userId: "cus_8Hq2Lm",
  sessionId: "chat-replacement-battery",
  release: "triage-v3.0.2",
  tags: ["langgraph"],
  input: { messages: [{ role: "user", content: TRIAGE_QUESTION }] },
  output: {
    messages: [
      {
        role: "assistant",
        content:
          "Your replacement battery (order #A-20931) shipped yesterday with UPS and arrives Friday.",
      },
    ],
  },
  observations: [
    {
      key: "graph",
      parentKey: null,
      type: "AGENT",
      name: "LangGraph",
      start: 0,
      end: 3208,
      input: { messages: [{ role: "user", content: TRIAGE_QUESTION }] },
      output: { next: "__end__" },
    },
    {
      key: "agent-1",
      parentKey: "graph",
      type: "CHAIN",
      name: "agent",
      start: 14,
      end: 1062,
    },
    {
      key: "llm-1",
      parentKey: "agent-1",
      type: "GENERATION",
      name: "ChatOpenAI",
      start: 22,
      end: 1031,
      model: "gpt-4.1",
      usage: { input: 412, output: 38 },
      ttft: 241,
      input: [
        {
          role: "system",
          content:
            "You are Acme's order support agent. Use tools to look up orders.",
        },
        { role: "user", content: TRIAGE_QUESTION },
      ],
      output: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_order01",
            type: "function",
            function: {
              name: "lookup_order",
              arguments: '{"robot_id":"RB-0042"}',
            },
          },
        ],
      },
    },
    {
      key: "write-1",
      parentKey: "agent-1",
      type: "SPAN",
      name: "ChannelWrite<agent,messages>",
      start: 1035,
      end: 1041,
      level: "DEBUG",
    },
    {
      key: "route-1",
      parentKey: "agent-1",
      type: "SPAN",
      name: "should_continue",
      start: 1044,
      end: 1050,
      level: "DEBUG",
      output: "tools",
    },
    {
      key: "tools",
      parentKey: "graph",
      type: "CHAIN",
      name: "tools",
      start: 1070,
      end: 1764,
    },
    {
      key: "lookup",
      parentKey: "tools",
      type: "TOOL",
      name: "lookup_order",
      start: 1078,
      end: 1742,
      input: { robot_id: "RB-0042" },
      output: {
        order_id: "A-20931",
        item: "Replacement battery pack (48V)",
        carrier: "UPS",
        status: "in_transit",
        eta: "Friday",
      },
    },
    {
      key: "write-2",
      parentKey: "tools",
      type: "SPAN",
      name: "ChannelWrite<tools,messages>",
      start: 1746,
      end: 1752,
      level: "DEBUG",
    },
    {
      key: "agent-2",
      parentKey: "graph",
      type: "CHAIN",
      name: "agent",
      start: 1772,
      end: 3196,
    },
    {
      key: "llm-2",
      parentKey: "agent-2",
      type: "GENERATION",
      name: "ChatOpenAI",
      start: 1779,
      end: 3170,
      model: "gpt-4.1",
      usage: { input: 538, output: 29 },
      ttft: 266,
      input: [
        { role: "user", content: TRIAGE_QUESTION },
        {
          role: "tool",
          tool_call_id: "call_order01",
          content: '{"order_id":"A-20931","carrier":"UPS","eta":"Friday"}',
        },
      ],
      output: {
        role: "assistant",
        content:
          "Your replacement battery (order #A-20931) shipped yesterday with UPS and arrives Friday.",
      },
    },
    {
      key: "write-3",
      parentKey: "agent-2",
      type: "SPAN",
      name: "ChannelWrite<agent,messages>",
      start: 3174,
      end: 3180,
      level: "DEBUG",
    },
    {
      key: "route-2",
      parentKey: "agent-2",
      type: "SPAN",
      name: "should_continue",
      start: 3183,
      end: 3189,
      level: "DEBUG",
      output: "__end__",
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Generation with a model that has no price yet (custom model definition)
// ---------------------------------------------------------------------------

const ROUTE_MESSAGE =
  "My robot's left wheel squeaks after the last firmware update. Not urgent.";

const routeTrace: TraceSpec = {
  key: "route",
  name: "route-ticket",
  minute: 50,
  userId: "cus_3Jt9Wd",
  release: "router-v0.9.4",
  tags: ["routing"],
  input: { message: ROUTE_MESSAGE },
  output: { queue: "hardware", priority: "low" },
  observations: [
    {
      key: "generation",
      parentKey: null,
      type: "GENERATION",
      name: "classify-ticket",
      start: 8,
      end: 912,
      model: UNPRICED_MODEL,
      usage: { input: 284, output: 22 },
      ttft: 197,
      modelParameters: { temperature: 0 },
      input: [
        {
          role: "system",
          content:
            "Route the ticket to one queue (billing, hardware, software, shipping) and set a priority. Reply as JSON.",
        },
        { role: "user", content: ROUTE_MESSAGE },
      ],
      output: { queue: "hardware", priority: "low" },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Background traffic for the traces table (full-text search page)
// ---------------------------------------------------------------------------

const trafficTrace = (
  key: string,
  name: string,
  minute: number,
  userId: string,
  message: string,
  reply: string,
  tags: string[],
): TraceSpec => ({
  key,
  name,
  minute,
  userId,
  tags,
  input: { message },
  output: { reply },
  observations: [
    {
      key: "generation",
      parentKey: null,
      type: "GENERATION",
      name: name === "sentiment-classifier" ? "classify" : "answer",
      start: 9,
      end: 640 + message.length * 6,
      model: "gpt-4.1",
      usage: {
        input: 860 + message.length * 3,
        output: 40 + reply.length / 2,
      },
      ttft: 180,
      input: [{ role: "user", content: message }],
      output: { role: "assistant", content: reply },
    },
  ],
});

const TRAFFIC: TraceSpec[] = [
  trafficTrace(
    "t1",
    "sentiment-classifier",
    120,
    "cus_7Rk2Pa",
    "Setup took five minutes and the robot mapped the whole warehouse overnight. Love it!",
    "positive",
    ["feedback"],
  ),
  trafficTrace(
    "t2",
    "qa-answer",
    116,
    "dev-omar.haddad",
    "Does the docking station work with 110V outlets?",
    "Yes, the docking station accepts 100-240V, so 110V outlets work without an adapter.",
    ["rag"],
  ),
  trafficTrace(
    "t3",
    "sentiment-classifier",
    111,
    "cus_2Nf8Qe",
    "Third time this month the app logs me out during a mission. Very frustrating.",
    "negative",
    ["feedback"],
  ),
  trafficTrace(
    "t4",
    "support-reply",
    106,
    "cus_9Vb4Tx",
    "My RB-0042 arrived with a cracked bumper and a loose charging pin. Can I get a replacement?",
    "I'm sorry about the damaged bumper! I've created replacement order #A-21007; a courier picks up the damaged unit on Monday.",
    ["shipping", "damage"],
  ),
  trafficTrace(
    "t5",
    "qa-answer",
    101,
    "dev-lena.park",
    "How long are mission logs retained?",
    "Mission logs are retained for 90 days on the Team plan and 1 year on Enterprise.",
    ["rag"],
  ),
  trafficTrace(
    "t6",
    "support-reply",
    92,
    "cus_5Gm1Hy",
    "Can I change the delivery address for order #A-20977?",
    "Done! Order #A-20977 now ships to the new address you provided.",
    ["shipping"],
  ),
  trafficTrace(
    "t7",
    "sentiment-classifier",
    86,
    "cus_1Zp6Ku",
    "The new obstacle detection is fine, nothing special.",
    "neutral",
    ["feedback"],
  ),
  trafficTrace(
    "t8",
    "qa-answer",
    74,
    "dev-omar.haddad",
    "Is there a sandbox environment for the Fleet API?",
    "Yes, use https://sandbox.acme-robotics.io/v2 with a sandbox key from the developer console.",
    ["rag"],
  ),
];

const TRACES: TraceSpec[] = [
  qaTrace,
  piiTrace,
  triageTrace,
  routeTrace,
  ...TRAFFIC,
];

// ---------------------------------------------------------------------------

const hexId = (...parts: string[]): string =>
  crypto
    .createHash("sha256")
    .update(parts.join(":"))
    .digest("hex")
    .slice(0, 16);

const serialize = (value: unknown): string | null => {
  if (value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};

type PromptRef = { id: string; version: number };

/**
 * Links the RAG generation to the production version of the QA prompt. The
 * docs-demo-prompts scenario curates that prompt; without it, create v1.
 */
const ensureQaPrompt = async (projectId: string): Promise<PromptRef> => {
  const existing = await prisma.prompt.findFirst({
    where: { projectId, name: QA_PROMPT_NAME, labels: { has: "production" } },
    select: { id: true, version: true },
  });
  if (existing) return existing;
  return prisma.prompt.upsert({
    where: {
      projectId_name_version: { projectId, name: QA_PROMPT_NAME, version: 1 },
    },
    update: {},
    create: {
      id: `${projectId}-${QA_PROMPT_NAME}-v1`,
      projectId,
      createdBy: "docs-demo-traces",
      name: QA_PROMPT_NAME,
      version: 1,
      type: "chat",
      labels: ["production", "latest"],
      config: { model: "gpt-4.1", temperature: 0.2 },
      prompt: [
        {
          role: "system",
          content:
            "You are Acme Robotics' help-center assistant. Answer developer questions using only the provided context. Cite the article titles you used. If the context does not cover the question, say so and point to support.\n\nContext:\n{{context}}",
        },
        { type: "placeholder", name: "chat_history" },
      ],
    },
    select: { id: true, version: true },
  });
};

const buildRows = (
  ctx: ScenarioContext,
  spec: TraceSpec,
  anchorMs: number,
  prompt: PromptRef,
) => {
  const traceId = hexId(ctx.idPrefix, spec.key);
  const timestamp = anchorMs + spec.minute * 60_000;
  const now = Date.now();
  const trace: TraceRecordInsertType = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: spec.name,
    timestamp,
    user_id: spec.userId,
    session_id: spec.sessionId ?? null,
    release: spec.release ?? null,
    version: null,
    tags: spec.tags,
    public: false,
    bookmarked: false,
    metadata: spec.metadata ?? {},
    input: serialize(spec.input),
    output: serialize(spec.output),
    created_at: now,
    updated_at: now,
    event_ts: now,
  });

  const ids = new Map(
    spec.observations.map((o) => [o.key, hexId(ctx.idPrefix, spec.key, o.key)]),
  );
  const observations: ObservationRecordInsertType[] = spec.observations.map(
    (o) => {
      const prices = o.model ? PRICES[o.model] : undefined;
      const usage = o.usage
        ? Object.fromEntries(
            Object.entries(o.usage).map(([k, v]) => [k, Math.round(v)]),
          )
        : undefined;
      const usageDetails = usage
        ? {
            ...usage,
            total: Object.values(usage).reduce((sum, v) => sum + v, 0),
          }
        : {};
      const costEntries =
        prices && usage
          ? Object.entries(usage)
              .filter(([k]) => prices[k] !== undefined)
              .map(([k, v]) => [k, v * prices[k]] as const)
          : [];
      const costTotal = costEntries.reduce((sum, [, v]) => sum + v, 0);
      const { toolDefinitions, toolArguments } = extractToolsFromObservation(
        o.input,
        o.output,
      );
      const toolCalls = convertCallsToArrays(toolArguments);

      return createObservation({
        id: ids.get(o.key)!,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: o.type,
        parent_observation_id: o.parentKey ? ids.get(o.parentKey)! : null,
        name: o.name,
        start_time: timestamp + o.start,
        end_time: timestamp + o.end,
        completion_start_time:
          o.ttft !== undefined ? timestamp + o.start + o.ttft : null,
        level: o.level ?? "DEFAULT",
        status_message: o.statusMessage ?? null,
        version: null,
        input: serialize(o.input),
        output: serialize(o.output),
        metadata: o.metadata ?? {},
        provided_model_name: o.model ?? null,
        internal_model_id: null,
        model_parameters: JSON.stringify(o.modelParameters ?? {}),
        provided_usage_details: usageDetails,
        usage_details: usageDetails,
        provided_cost_details: Object.fromEntries(costEntries),
        cost_details: costEntries.length
          ? { ...Object.fromEntries(costEntries), total: costTotal }
          : {},
        total_cost: costEntries.length ? costTotal : null,
        tool_definitions: convertDefinitionsToMap(toolDefinitions),
        tool_calls: toolCalls.tool_calls,
        tool_call_names: toolCalls.tool_call_names,
        prompt_id: o.prompt ? prompt.id : null,
        prompt_name: o.prompt ? QA_PROMPT_NAME : null,
        prompt_version: o.prompt ? prompt.version : null,
        created_at: now,
        updated_at: now,
        event_ts: now,
      });
    },
  );
  return { trace, observations, timestamp };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] !== false;
  // 08:00 UTC today; trace offsets are whole minutes after it. Day-anchored so
  // same-day re-runs overwrite in place.
  const anchorMs = utcDayStartMs() + 8 * 3_600_000;
  const observationCount = TRACES.reduce(
    (sum, t) => sum + t.observations.length,
    0,
  );

  if (ctx.dryRun) {
    return {
      scenario: "docs-demo-traces",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: TRACES.map((t) => hexId(ctx.idPrefix, t.key)),
      sessionIds: [],
      counts: {
        traces: TRACES.length,
        observations: observationCount,
        events: withV4 ? TRACES.length + observationCount : 0,
      },
      verified: {},
      links: [],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const qaPrompt = await ensureQaPrompt(ctx.projectId);
  // Reset the custom-model video: the model is created in the UI on camera.
  const staleModels = await prisma.model.findMany({
    where: { projectId: ctx.projectId, modelName: UNPRICED_MODEL },
    select: { id: true },
  });
  if (staleModels.length) {
    const modelIds = staleModels.map((m) => m.id);
    await prisma.$transaction([
      prisma.price.deleteMany({ where: { modelId: { in: modelIds } } }),
      prisma.pricingTier.deleteMany({ where: { modelId: { in: modelIds } } }),
      prisma.model.deleteMany({ where: { id: { in: modelIds } } }),
    ]);
    ctx.log(
      `removed ${modelIds.length} '${UNPRICED_MODEL}' model definition(s)`,
    );
  }

  const built = TRACES.map((spec) => buildRows(ctx, spec, anchorMs, qaPrompt));
  const traces = built.map((b) => b.trace);
  const observations = built.flatMap((b) => b.observations);
  const events = withV4
    ? built.flatMap((b) => [
        traceToEvent(b.trace),
        ...b.observations.map((o) => observationToEvent(o, b.trace)),
      ])
    : [];

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations, ${events.length} events`,
  );
  await createTracesCh(traces);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const traceIds = traces.map((t) => t.id);
  const where = `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`;
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      where,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      where,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    );
  }
  if (
    verified.traces < traces.length ||
    verified.observations < observations.length ||
    (withV4 && verified.events < events.length)
  ) {
    throw new SeedError(
      `Readback mismatch: wrote ${traces.length}/${observations.length}/${events.length} traces/observations/events, read ${JSON.stringify(verified)}`,
    );
  }

  return {
    scenario: "docs-demo-traces",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [
      ...new Set(TRACES.flatMap((t) => (t.sessionId ? [t.sessionId] : []))),
    ],
    counts: {
      traces: traces.length,
      observations: observations.length,
      events: events.length,
    },
    verified,
    links: [
      ...built.map((b) => traceLink(ctx, b.trace.id, b.timestamp)),
      tracesListLink(ctx),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const docsDemoTracesScenario: ScenarioDefinition = {
  name: "docs-demo-traces",
  description:
    "Curated docs-video traces for --project docs-demo: a RAG chat answer (retrieval, embedding, linked chat prompt, long chat history, cached-token cost), a PII anonymize → generation → deanonymize trace, a LangGraph-style agent with DEBUG-level internals, a generation on an unpriced model (grok-4-fast; its project model is deleted on re-run), and 8 short support traces for the traces table. v4 events on by default.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "also mirror into v4 events_full/events_core",
    },
  ],
  run,
};
