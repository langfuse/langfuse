import { prisma } from "../../../src/db";
import {
  convertCallsToArrays,
  convertDefinitionsToMap,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createSessionScore,
  createTrace,
  createTraceScore,
  createTracesCh,
  extractToolsFromObservation,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, sessionLink, traceLink } from "./verify";

/**
 * A demo-grade, fully handcrafted multi-user SESSION for the session timeline:
 * an on-call copilot working a checkout-latency incident with four engineers
 * in a Slack incident channel, seven turns over ~56 minutes.
 *
 * Where `support-agent` is one trace, this is the session-level counterpart:
 * every turn carries real-looking content and together they exercise what the
 * session view renders —
 *
 *  - four users (header user chips + overflow) and named senders (`name` on
 *    each user message)
 *  - OpenAI chat history that accumulates across turns, with reasoning parts,
 *    markdown answers (tables, diff blocks, lists) and one refusal
 *  - tool calls matched to TOOL observations via `metadata.toolCallId`,
 *    parallel calls, and two calls the app ran without tracing (the UI rolls
 *    those up under their generation)
 *  - a TOOL that delegates to a nested sub-agent (AGENT → GENERATION,
 *    RETRIEVER, TOOLs) — the "tool row with nested observations" shape
 *  - WARNING and ERROR rows with status messages, guardrails, an EVENT
 *  - three models with usage/cost including `total`, short follow-ups next to
 *    5-20 minute idle gaps
 *  - typed session scores (numeric/categorical/boolean; API, EVAL and
 *    ANNOTATION sources, comments, metadata; the ANNOTATION one backed by a
 *    project score config), trace feedback scores, and session + trace
 *    comments
 *
 * Deterministic: no randomness; ids derive from --id-prefix (the prefix IS the
 * session id) and every timestamp is a fixed offset from 22:00 UTC of the
 * previous UTC day, so same-day re-runs overwrite in place.
 */

const MODEL_PRICES = {
  "gpt-5.4": { input: 1.25e-6, output: 1e-5 },
  "claude-sonnet-4-5": { input: 3e-6, output: 1.5e-5 },
  "claude-haiku-4-5": { input: 1e-6, output: 5e-6 },
} as const;

type ModelName = keyof typeof MODEL_PRICES;

type ToolCallSpec = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** objects are stored pretty-printed (TOOL rows render I/O verbatim), strings as-is */
  result: unknown;
  ms: number;
  /** false: the app ran the tool without tracing it, so there is no TOOL observation */
  traced?: boolean;
  level?: "WARNING" | "ERROR";
  statusMessage?: string;
  /** a delegated sub-agent run nested under this TOOL observation */
  subagent?: SubagentSpec;
};

type LlmStep = {
  kind: "llm";
  name: string;
  model: ModelName;
  ms: number;
  ttft: number;
  temperature?: number;
  reasoning?: string;
  text?: string;
  refusal?: string;
  toolCalls?: ToolCallSpec[];
};

type SpanStep = {
  kind: "guardrail" | "retriever";
  name: string;
  ms: number;
  input: unknown;
  output: unknown;
  level?: "WARNING";
  statusMessage?: string;
};

type Step =
  | LlmStep
  | SpanStep
  | { kind: "wait"; ms: number }
  | { kind: "event"; name: string; metadata: Record<string, string> };

type SubagentSpec = {
  name: string;
  system: string;
  task: string;
  steps: Step[];
};

type TurnSpec = {
  /** trace name — shown in bold per turn in the session sidebar */
  name: string;
  /** offset from the session start (22:00 UTC) */
  atMs: number;
  userId: string;
  /** chat display name, carried as `name` on the user message */
  sender: string;
  message: string;
  tags: string[];
  bookmarked?: boolean;
  steps: Step[];
};

const USERS = {
  maya: { id: "maya.okafor", sender: "maya" },
  jonas: { id: "jonas.weber", sender: "jonas" },
  priya: { id: "priya.raman", sender: "priya" },
  alex: { id: "alex.kim", sender: "alex" },
} as const;

const SEVERITY_CONFIG = {
  name: "incident-severity",
  categories: [
    { label: "SEV-1", value: 1 },
    { label: "SEV-2", value: 2 },
    { label: "SEV-3", value: 3 },
  ],
  description:
    "Incident severity assigned in review; SEV-1 is the most severe.",
};

const SESSION_METADATA = {
  scenario: "incident-session",
  incident: "INC-4471",
  channel: "#inc-4471-checkout-latency",
  workspace: "northwind",
};

const COPILOT_SYSTEM_PROMPT = [
  "You are Northwind's on-call copilot in Slack incident channels.",
  "Tools: query_metrics, list_deploys, search_logs, get_pull_request_diff, get_rollout_status, delegate_task, create_issue, resolve_incident, publish_status_update.",
  "Cite evidence (numbers, deploy ids, UTC times). Keep answers short and scannable.",
  "Never make destructive production changes from chat — propose a change request instead.",
].join("\n");

const MINUTE = 60_000;

const TURNS: TurnSpec[] = [
  {
    name: "triage-what-changed",
    atMs: 0,
    userId: USERS.maya.id,
    sender: USERS.maya.sender,
    message:
      "@copilot checkout p95 just jumped from ~350ms to 4s+ and the error rate is climbing. What changed in the last hour?",
    tags: ["triage"],
    steps: [
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 1830,
        ttft: 610,
        reasoning:
          "Latency and errors rose together on checkout-api. Pin the start time from the metric, list deploys across checkout's dependencies in the last hour, and pull error logs to see which dependency is failing — all three in parallel.",
        toolCalls: [
          {
            id: "call_mQ8e2vLr4TzA",
            name: "query_metrics",
            args: {
              query: "p95:trace.http.request.duration{service:checkout-api}",
              from: "now-60m",
              rollup: "1m",
            },
            ms: 910,
            result: {
              metric: "p95:trace.http.request.duration{service:checkout-api}",
              unit: "ms",
              baseline_p95: 348,
              current_p95: 4210,
              change_point: "21:52 UTC",
              error_rate: { baseline: "0.2%", current: "6.1%" },
              series_tail: [352, 349, 361, 1840, 3920, 4105, 4210],
            },
          },
          {
            id: "call_d3Kp7wNc9HsB",
            name: "list_deploys",
            args: {
              services: ["checkout-api", "payments-service", "checkout-web"],
              since: "now-60m",
            },
            ms: 580,
            result: {
              deploys: [
                {
                  service: "payments-service",
                  id: "#4812",
                  at: "21:51 UTC",
                  author: "jonas.weber",
                  title: "Tune DB connection pool for pgbouncer (max 50 → 10)",
                  status: "success",
                },
                {
                  service: "checkout-web",
                  id: "#9921",
                  at: "21:34 UTC",
                  author: "lena.park",
                  title: "Update promo banner copy",
                  status: "success",
                },
              ],
            },
          },
          {
            id: "call_l5Xz1qRt6YmC",
            name: "search_logs",
            args: {
              query: "service:checkout-api status:error",
              from: "now-30m",
              limit: 500,
            },
            ms: 2710,
            level: "WARNING",
            statusMessage:
              "Result truncated: returned the first 500 of 12,904 matching lines",
            result: {
              matched: 12904,
              returned: 500,
              top_errors: [
                {
                  count: 11873,
                  message:
                    "TimeoutError: timed out acquiring connection from pool after 3000ms",
                  origin: "payments-service ← checkout-api POST /v1/charge",
                },
                {
                  count: 1031,
                  message: "UpstreamError: payments-service responded 503",
                  origin: "checkout-api",
                },
              ],
              first_seen: "21:52:07 UTC",
            },
          },
        ],
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 9450,
        ttft: 820,
        text: [
          "**Most likely cause: payments-service deploy #4812 (21:51 UTC).**",
          "",
          "| Time (UTC) | Change | Service |",
          "| --- | --- | --- |",
          "| 21:34 | #9921 promo banner copy | checkout-web |",
          "| **21:51** | **#4812 DB pool max 50 → 10** | **payments-service** |",
          "| 21:52 | p95 348 ms → 4.2 s, errors 0.2% → 6.1% | checkout-api |",
          "",
          "- 92% of errors (11,873) are `TimeoutError: timed out acquiring connection from pool after 3000ms`, all on calls into payments-service.",
          "- The spike starts one minute after #4812 rolled out; #9921 only touched banner copy.",
          "",
          "**Suggested next step:** roll back #4812 (owner: @jonas.weber). Want me to pull the diff first?",
        ].join("\n"),
      },
    ],
  },
  {
    name: "triage-show-diff",
    atMs: 2 * MINUTE + 10_000,
    userId: USERS.maya.id,
    sender: USERS.maya.sender,
    message: "Yes — show me the diff for #4812.",
    tags: ["triage"],
    steps: [
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 940,
        ttft: 390,
        toolCalls: [
          {
            id: "call_g7Hd2kPq1XwD",
            name: "get_pull_request_diff",
            args: { repo: "northwind/payments-service", number: 4812 },
            ms: 460,
            result: [
              "diff --git a/config/database.yml b/config/database.yml",
              "@@ -12,7 +12,7 @@ production:",
              "   adapter: postgresql",
              '   host: <%= ENV["PGBOUNCER_HOST"] %>',
              "-  pool: 50",
              "+  pool: 10",
              "   checkout_timeout: 3",
              "   prepared_statements: false",
            ].join("\n"),
          },
        ],
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 7120,
        ttft: 700,
        text: [
          "It's a one-line change in `config/database.yml`:",
          "",
          "```diff",
          "-  pool: 50",
          "+  pool: 10",
          "   checkout_timeout: 3",
          "```",
          "",
          "At peak each `POST /v1/charge` fans out to ~24 concurrent queries across 4 Puma workers, so a pool of 10 saturates immediately and requests wait the full `checkout_timeout` (3 s) — exactly the 3000 ms timeouts in the logs.",
          "",
          "The PR says the value was meant for pgbouncer transaction pooling, which isn't live in production yet.",
        ].join("\n"),
      },
    ],
  },
  {
    name: "mitigate-watch-rollback",
    atMs: 9 * MINUTE + 5_000,
    userId: USERS.jonas.id,
    sender: USERS.jonas.sender,
    message:
      "Payments here 👋 rolling back #4812 now. Can you watch the rollout and tell me when error rates recover?",
    tags: ["mitigation"],
    bookmarked: true,
    steps: [
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 1120,
        ttft: 450,
        reasoning:
          "Watch the payments-service rollout first; recovery metrics only mean something once all pods run the previous image.",
        toolCalls: [
          {
            id: "call_r2Tn8vBx5KqE",
            name: "get_rollout_status",
            args: { namespace: "payments", deployment: "payments-service" },
            ms: 640,
            level: "ERROR",
            statusMessage:
              "Rollout paused: 1/6 pods in CrashLoopBackOff (payments-service-7c9f4d-x2kqp)",
            result: {
              status: "paused",
              ready: "5/6",
              revision: 212,
              image: "payments-service:2026.09.28-4811",
              unhealthy_pods: [
                {
                  name: "payments-service-7c9f4d-x2kqp",
                  state: "CrashLoopBackOff",
                  node: "ip-10-2-7-19",
                  last_log:
                    "readiness probe failed: dial tcp 10.2.7.19:8080: connect: connection refused",
                },
              ],
            },
          },
        ],
      },
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 1480,
        ttft: 520,
        reasoning:
          "5/6 pods are healthy on the old image. The failing pod sits on ip-10-2-7-19, which the cluster autoscaler is draining — it will be rescheduled, so this is not a bad rollback. Wait a minute, then re-check the rollout and error rate together.",
        text: "One pod is crash-looping on a node that's being drained — checking again in 60s.",
        toolCalls: [],
      },
      { kind: "wait", ms: 60_000 },
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 860,
        ttft: 380,
        toolCalls: [
          {
            id: "call_s9Jw4mLc2PzF",
            name: "get_rollout_status",
            args: { namespace: "payments", deployment: "payments-service" },
            ms: 590,
            result: {
              status: "complete",
              ready: "6/6",
              revision: 212,
              image: "payments-service:2026.09.28-4811",
              rescheduled: [
                {
                  pod: "payments-service-7c9f4d-x2kqp",
                  from: "ip-10-2-7-19",
                  to: "ip-10-2-4-88",
                },
              ],
            },
          },
          {
            id: "call_q4Vb7nHs8RtG",
            name: "query_metrics",
            args: {
              query:
                "p95:trace.http.request.duration{service:checkout-api}, error_rate{service:checkout-api}",
              from: "now-10m",
              rollup: "1m",
            },
            ms: 820,
            result: {
              p95_ms: { peak: 4210, now: 610, trend: "falling" },
              error_rate: { peak: "6.1%", now: "0.4%", trend: "falling" },
            },
          },
        ],
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 6980,
        ttft: 640,
        text: [
          "✅ **Rollback complete** — 6/6 pods ready on `payments-service:2026.09.28-4811`.",
          "",
          "One pod briefly crash-looped because its node (`ip-10-2-7-19`) was being drained by the autoscaler; it was rescheduled to `ip-10-2-4-88` and is healthy. Unrelated to the rollback.",
          "",
          "| checkout-api | Peak | Now |",
          "| --- | --- | --- |",
          "| p95 latency | 4.2 s | 610 ms ↓ |",
          "| Error rate | 6.1% | 0.4% ↓ |",
          "",
          "I'll keep watching until we're back at baseline (~350 ms p95, 0.2% errors).",
        ].join("\n"),
      },
    ],
  },
  {
    name: "comms-status-page",
    atMs: 17 * MINUTE + 40_000,
    userId: USERS.priya.id,
    sender: USERS.priya.sender,
    message:
      "Support lead here — tickets are coming in. Can you draft a status page update? Customer-friendly, no internal details please.",
    tags: ["comms"],
    steps: [
      {
        kind: "llm",
        name: "draft-status-update",
        model: "claude-sonnet-4-5",
        ms: 5260,
        ttft: 910,
        temperature: 0.5,
        reasoning:
          "External audience: no service names, deploy ids or hostnames. State the impact window, that it's mitigated, and when the next update comes.",
        text: [
          "Here's a draft:",
          "",
          "> **Degraded checkout performance — Monitoring**",
          ">",
          "> Between **21:52 and 22:10 UTC**, some customers experienced slow or failed checkouts. We identified the cause, reverted a recent configuration change, and checkout is performing normally again.",
          ">",
          "> We're monitoring closely and will post a final update within the hour. We're sorry for the disruption.",
        ].join("\n"),
      },
      {
        kind: "guardrail",
        name: "guardrail.external-comms",
        ms: 180,
        input: {
          checks: ["internal_identifiers", "customer_data", "blame", "tone"],
          audience: "public-status-page",
        },
        output: { verdict: "pass", flags: [], reading_level: "grade 7" },
      },
    ],
  },
  {
    name: "postmortem-draft",
    atMs: 31 * MINUTE + 20_000,
    userId: USERS.maya.id,
    sender: USERS.maya.sender,
    message:
      "p95 has been at baseline for 15 min. Please draft the postmortem timeline and file follow-ups for the pool config and the late alert.",
    tags: ["postmortem"],
    steps: [
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 1260,
        ttft: 480,
        reasoning:
          "Hand the write-up to the postmortem sub-agent — it has the incident timeline and channel history tools — then file the two follow-ups myself.",
        toolCalls: [
          {
            id: "call_p6Ym3tQw9LvH",
            name: "delegate_task",
            args: {
              agent: "postmortem-writer",
              incident: "INC-4471",
              deliverable: "timeline + root cause + follow-ups",
            },
            ms: 0,
            result: {
              status: "done",
              doc: "https://wiki.northwind.dev/postmortems/INC-4471",
              sections: ["Summary", "Timeline", "Root cause", "Follow-ups"],
            },
            subagent: {
              name: "postmortem-writer",
              system:
                "You write blameless incident postmortems. Use UTC times, cite sources, and keep follow-ups concrete with an owner each.",
              task: "Draft the postmortem for INC-4471 (checkout latency). Use the incident timeline, the #inc-4471 channel history and similar past incidents.",
              steps: [
                {
                  kind: "llm",
                  name: "gather-context",
                  model: "claude-haiku-4-5",
                  ms: 1340,
                  ttft: 430,
                  toolCalls: [
                    {
                      id: "toolu_01XkT7fPq3Rw9",
                      name: "get_incident_timeline",
                      args: { incident: "INC-4471" },
                      ms: 520,
                      result: {
                        incident: "INC-4471",
                        severity: "SEV-2",
                        events: [
                          {
                            at: "21:51",
                            event: "payments-service #4812 deployed",
                          },
                          {
                            at: "21:52",
                            event: "checkout p95 > 4 s, errors 6.1%",
                          },
                          { at: "22:00", event: "on-call engaged the copilot" },
                          { at: "22:09", event: "rollback of #4812 started" },
                          { at: "22:10", event: "rollback complete" },
                          {
                            at: "22:16",
                            event: "latency and errors at baseline",
                          },
                        ],
                      },
                    },
                    {
                      id: "toolu_01Hc2WmZ8sLn4",
                      name: "get_channel_history",
                      args: { channel: "#inc-4471-checkout-latency" },
                      ms: 690,
                      result: {
                        messages: 23,
                        participants: [
                          "maya.okafor",
                          "jonas.weber",
                          "priya.raman",
                          "alex.kim",
                        ],
                        decisions: [
                          "rollback #4812 (jonas.weber)",
                          "status page update (priya.raman)",
                        ],
                      },
                    },
                  ],
                },
                {
                  kind: "retriever",
                  name: "similar-incidents",
                  ms: 240,
                  input: {
                    query: "connection pool exhaustion after config change",
                    top_k: 3,
                  },
                  output: {
                    documents: [
                      {
                        id: "INC-3902",
                        title: "Orders API pool exhaustion",
                        score: 0.87,
                      },
                      {
                        id: "INC-3518",
                        title: "pgbouncer rollout latency",
                        score: 0.74,
                      },
                    ],
                  },
                },
                {
                  kind: "llm",
                  name: "write-postmortem",
                  model: "claude-haiku-4-5",
                  ms: 8420,
                  ttft: 560,
                  text: [
                    "## INC-4471 — Checkout latency from DB pool exhaustion",
                    "",
                    "**Impact:** 21:52–22:10 UTC, slow or failed checkouts for ~18 minutes. No data loss.",
                    "",
                    "**Root cause:** payments-service #4812 lowered the connection pool from 50 to 10 ahead of a pgbouncer migration that wasn't live yet; peak fan-out needs ~24 connections.",
                    "",
                    "**Follow-ups**",
                    "1. Validate pool size against peak query fan-out in CI (payments).",
                    "2. Alert on connection-pool wait time (observability) — the latency SLO alert fired 11 minutes late.",
                  ].join("\n"),
                },
              ],
            },
          },
        ],
      },
      {
        kind: "llm",
        name: "file-follow-ups",
        model: "gpt-5.4",
        ms: 1540,
        ttft: 520,
        toolCalls: [
          {
            id: "call_c1Nf5xKd7WbJ",
            name: "create_issue",
            args: {
              team: "PAY",
              title: "Validate DB pool size against peak query fan-out in CI",
              labels: ["incident:INC-4471"],
            },
            ms: 410,
            traced: false,
            result: {
              id: "PAY-1187",
              url: "https://tracker.northwind.dev/PAY-1187",
            },
          },
          {
            id: "call_c2Ze8yMg4VtK",
            name: "create_issue",
            args: {
              team: "OBS",
              title:
                "Alert on connection-pool wait time for checkout dependencies",
              labels: ["incident:INC-4471"],
            },
            ms: 380,
            traced: false,
            result: {
              id: "OBS-342",
              url: "https://tracker.northwind.dev/OBS-342",
            },
          },
        ],
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 8870,
        ttft: 690,
        text: [
          "📝 **Postmortem draft:** [INC-4471 — Checkout latency from DB pool exhaustion](https://wiki.northwind.dev/postmortems/INC-4471)",
          "",
          "| Time (UTC) | Event |",
          "| --- | --- |",
          "| 21:51 | payments-service #4812 deployed (pool 50 → 10) |",
          "| 21:52 | checkout p95 4.2 s, errors 6.1% |",
          "| 22:00 | @maya engages the copilot |",
          "| 22:09 | @jonas starts the rollback |",
          "| 22:10 | rollback complete |",
          "| 22:16 | back to baseline |",
          "",
          "**Follow-ups filed**",
          "- **PAY-1187** — validate pool size against peak query fan-out in CI",
          "- **OBS-342** — alert on connection-pool wait time (the SLO alert fired 11 min late)",
          "",
          "Time to mitigate: **18 min**.",
        ].join("\n"),
      },
    ],
  },
  {
    name: "change-request",
    atMs: 35 * MINUTE + 50_000,
    userId: USERS.alex.id,
    sender: USERS.alex.sender,
    message:
      "Should we just delete the old pool settings from the prod config so this can't happen again? Can you do it?",
    tags: ["change-request"],
    steps: [
      {
        kind: "guardrail",
        name: "guardrail.prod-change",
        ms: 210,
        input: {
          checks: ["destructive_action", "production_scope"],
          target: "payments-service/config/database.yml",
        },
        output: {
          verdict: "flag",
          policy: "prod-change-requires-approval",
          action: "route_to_change_request",
        },
        level: "WARNING",
        statusMessage:
          "Destructive production change requested — routed to the change-request flow",
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 4630,
        ttft: 560,
        refusal:
          "I can't change or delete production configuration from chat — prod config changes need an approved change request.",
        text: [
          "Deleting the settings wouldn't prevent a repeat — the default pool is 5, which is even smaller. Here's the safe path:",
          "",
          "1. Open a change request that sets `pool` explicitly from peak fan-out (I can pre-fill it from today's numbers).",
          "2. Land the CI check from **PAY-1187** first so a too-small pool fails the build.",
          "3. Roll out behind the pgbouncer flag once transaction pooling is live.",
        ].join("\n"),
      },
    ],
  },
  {
    name: "resolve-incident",
    atMs: 56 * MINUTE,
    userId: USERS.maya.id,
    sender: USERS.maya.sender,
    message:
      "All clear for 40 minutes. Closing INC-4471 — please resolve it and publish the final status update.",
    tags: ["resolution"],
    steps: [
      {
        kind: "llm",
        name: "plan",
        model: "gpt-5.4",
        ms: 1020,
        ttft: 410,
        toolCalls: [
          {
            id: "call_v8Rk1pWn6CyL",
            name: "resolve_incident",
            args: { incident: "INC-4471", resolution: "rolled back #4812" },
            ms: 350,
            result: {
              incident: "INC-4471",
              status: "resolved",
              resolved_at: "22:56 UTC",
              duration_min: 64,
            },
          },
          {
            id: "call_u3Hs9bTe2QxM",
            name: "publish_status_update",
            args: {
              page: "status.northwind.dev",
              state: "resolved",
              title: "Degraded checkout performance",
            },
            ms: 470,
            result: {
              published: true,
              url: "https://status.northwind.dev/incidents/q7kd2",
            },
          },
        ],
      },
      {
        kind: "event",
        name: "incident.resolved",
        metadata: { incident: "INC-4471" },
      },
      {
        kind: "llm",
        name: "respond",
        model: "gpt-5.4",
        ms: 3910,
        ttft: 520,
        text: [
          "**INC-4471 resolved** at 22:56 UTC. Customer impact 21:52–22:10 UTC (18 min).",
          "",
          "- Final update published on [status.northwind.dev](https://status.northwind.dev/incidents/q7kd2)",
          "- Postmortem review: Thursday 15:00 UTC with @maya and @jonas",
          "",
          "Thanks everyone 🙏",
        ].join("\n"),
      },
    ],
  },
];

type PlannedObservation = {
  id: string;
  parentId: string | null;
  type: ObservationType;
  name: string;
  start: number;
  end: number;
  input?: unknown;
  output?: unknown;
  /** stored verbatim instead of JSON-encoded (TOOL rows show I/O as stored) */
  rawInput?: string;
  rawOutput?: string;
  model?: ModelName;
  modelParameters?: Record<string, unknown>;
  usage?: [number, number];
  ttft?: number;
  level?: "WARNING" | "ERROR";
  statusMessage?: string;
  metadata: Record<string, string>;
};

type ChatMessage = Record<string, unknown>;

const estimateTokens = (value: unknown): number =>
  Math.max(1, Math.round(JSON.stringify(value).length / 3.7));

const assistantOutput = (step: LlmStep): ChatMessage => {
  const content: Array<Record<string, string>> = [];
  if (step.reasoning) content.push({ type: "reasoning", text: step.reasoning });
  if (step.text) content.push({ type: "text", text: step.text });
  const toolCalls = step.toolCalls ?? [];
  return {
    role: "assistant",
    content: content.length > 0 ? content : null,
    ...(step.refusal ? { refusal: step.refusal } : {}),
    ...(toolCalls.length > 0
      ? {
          tool_calls: toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        }
      : {}),
  };
};

const toolResultContent = (result: unknown): string =>
  typeof result === "string" ? result : JSON.stringify(result);

/**
 * Lays out one agent loop (the turn's steps, or a sub-agent's) on a timeline
 * starting at `cursorStart`, appending observations under `parentId` and
 * extending `history` the way the app would resend it. Returns the end offset.
 */
const planSteps = (args: {
  steps: Step[];
  parentId: string;
  cursorStart: number;
  history: ChatMessage[];
  observations: PlannedObservation[];
  nextId: () => string;
  metadata: Record<string, string>;
}): number => {
  const { steps, parentId, history, observations, nextId, metadata } = args;
  let cursor = args.cursorStart;

  for (const step of steps) {
    if (step.kind === "wait") {
      cursor += step.ms;
      continue;
    }
    if (step.kind === "event") {
      cursor += 30;
      observations.push({
        id: nextId(),
        parentId,
        type: "EVENT",
        name: step.name,
        start: cursor,
        end: cursor,
        metadata: { ...metadata, ...step.metadata },
      });
      continue;
    }
    if (step.kind !== "llm") {
      const start = cursor + 30;
      observations.push({
        id: nextId(),
        parentId,
        type: step.kind === "guardrail" ? "GUARDRAIL" : "RETRIEVER",
        name: step.name,
        start,
        end: start + step.ms,
        input: step.input,
        output: step.output,
        level: step.level,
        statusMessage: step.statusMessage,
        metadata,
      });
      cursor = start + step.ms;
      continue;
    }

    // LLM call: the input is everything the app resends; the output is the
    // assistant message (reasoning, text, refusal, tool calls).
    const input = [...history];
    const output = assistantOutput(step);
    const start = cursor + 60;
    observations.push({
      id: nextId(),
      parentId,
      type: "GENERATION",
      name: step.name,
      start,
      end: start + step.ms,
      input,
      output,
      model: step.model,
      modelParameters: {
        temperature: step.temperature ?? 0.2,
        max_tokens: 2048,
        ...(step.toolCalls?.length ? { tool_choice: "auto" } : {}),
      },
      usage: [estimateTokens(input) + 350, estimateTokens(output)],
      ttft: step.ttft,
      metadata,
    });
    cursor = start + step.ms;

    const toolCalls = step.toolCalls ?? [];
    history.push({
      role: "assistant",
      content: step.text ?? null,
      ...(toolCalls.length > 0
        ? { tool_calls: (output.tool_calls as unknown[]) ?? [] }
        : {}),
    });

    // Tool calls run in parallel, each traced as a TOOL observation carrying
    // the call id so the session view pairs it with the rolled-up call.
    let toolsEnd = cursor;
    toolCalls.forEach((call, index) => {
      const toolStart = cursor + 40 + index * 6;
      let toolEnd = toolStart + call.ms;
      if (call.traced !== false) {
        const toolId = nextId();
        if (call.subagent) {
          const agentId = nextId();
          const agentStart = toolStart + 20;
          const subHistory: ChatMessage[] = [
            { role: "system", content: call.subagent.system },
            { role: "user", content: call.subagent.task },
          ];
          const agentObservations: PlannedObservation[] = [];
          const agentEnd =
            planSteps({
              steps: call.subagent.steps,
              parentId: agentId,
              cursorStart: agentStart,
              history: subHistory,
              observations: agentObservations,
              nextId,
              metadata: { ...metadata, agent: call.subagent.name },
            }) + 20;
          toolEnd = agentEnd + 25;
          observations.push(
            {
              id: toolId,
              parentId,
              type: "TOOL",
              name: call.name,
              start: toolStart,
              end: toolEnd,
              rawInput: JSON.stringify(call.args, null, 2),
              rawOutput: JSON.stringify(call.result, null, 2),
              metadata: { ...metadata, toolCallId: call.id },
            },
            {
              id: agentId,
              parentId: toolId,
              type: "AGENT",
              name: call.subagent.name,
              start: agentStart,
              end: agentEnd,
              metadata: { ...metadata, agent: call.subagent.name },
            },
            ...agentObservations,
          );
        } else {
          observations.push({
            id: toolId,
            parentId,
            type: "TOOL",
            name: call.name,
            start: toolStart,
            end: toolEnd,
            rawInput: JSON.stringify(call.args, null, 2),
            rawOutput:
              typeof call.result === "string"
                ? call.result
                : JSON.stringify(call.result, null, 2),
            level: call.level,
            statusMessage: call.statusMessage,
            metadata: { ...metadata, toolCallId: call.id },
          });
        }
      }
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResultContent(call.result),
      });
      toolsEnd = Math.max(toolsEnd, toolEnd);
    });
    cursor = toolsEnd;
  }
  return cursor;
};

const lastLlmStep = (turn: TurnSpec): LlmStep | undefined =>
  turn.steps.filter((step): step is LlmStep => step.kind === "llm").at(-1);

/** Final assistant text of a turn (trace output): the answer and/or refusal. */
const finalAnswer = (turn: TurnSpec): string => {
  const last = lastLlmStep(turn);
  return [last?.refusal, last?.text].filter(Boolean).join("\n\n");
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;

  // The prefix IS the session id, so `--id-prefix inc-4471-checkout-latency`
  // reads like a production session in the header.
  const sessionId = ctx.idPrefix;
  const traceIds = TURNS.map((_, index) => `${ctx.idPrefix}-t${index + 1}`);
  // 22:00 UTC of the previous UTC day: always in the past, identical for
  // same-day re-runs (ORDER BY keys stay stable), and matches the UTC times
  // quoted in the payloads.
  const sessionStart = utcDayStartMs() - 2 * 60 * MINUTE;

  if (ctx.dryRun) {
    return {
      scenario: "incident-session",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [sessionId],
      counts: { sessions: 1, traces: TURNS.length },
      verified: {},
      links: [sessionLink(ctx, sessionId)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const history: ChatMessage[] = [
    { role: "system", content: COPILOT_SYSTEM_PROMPT },
  ];

  TURNS.forEach((turn, turnIndex) => {
    const traceId = traceIds[turnIndex];
    const traceStart = sessionStart + turn.atMs;
    let observationIndex = 0;
    const nextId = () => `${traceId}-o${observationIndex++}`;
    const metadata = {
      scenario: "incident-session",
      turn: String(turnIndex + 1),
    };

    history.push({ role: "user", name: turn.sender, content: turn.message });

    const rootId = nextId();
    const planned: PlannedObservation[] = [];
    const end = planSteps({
      steps: turn.steps,
      parentId: rootId,
      cursorStart: 0,
      history,
      observations: planned,
      nextId,
      metadata,
    });
    // Root AGENT without I/O: the session timeline shows its children expanded.
    planned.unshift({
      id: rootId,
      parentId: null,
      type: "AGENT",
      name: "oncall-copilot",
      start: 0,
      end: end + 40,
      metadata: { ...metadata, channel: SESSION_METADATA.channel },
    });

    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: sessionId,
      user_id: turn.userId,
      name: turn.name,
      timestamp: traceStart,
      release: "copilot-2026.09.3",
      version: "oncall-copilot-v4",
      tags: ["incident", "INC-4471", ...turn.tags],
      public: false,
      bookmarked: turn.bookmarked ?? false,
      metadata: { ...SESSION_METADATA, turn: String(turnIndex + 1) },
      input: turn.message,
      output: finalAnswer(turn),
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    for (const p of planned) {
      const prices = p.model ? MODEL_PRICES[p.model] : null;
      const [usageInput, usageOutput] = p.usage ?? [0, 0];
      const inputCost = prices ? usageInput * prices.input : 0;
      const outputCost = prices ? usageOutput * prices.output : 0;
      // Direct ClickHouse writes bypass ingestion, so apply the same tool
      // extraction it would (tool_calls / tool_call_names columns).
      const { toolDefinitions, toolArguments } = extractToolsFromObservation(
        p.input,
        p.output,
      );
      const toolCallArrays = convertCallsToArrays(toolArguments);

      observations.push(
        createObservation({
          tool_definitions: convertDefinitionsToMap(toolDefinitions),
          tool_calls: toolCallArrays.tool_calls,
          tool_call_names: toolCallArrays.tool_call_names,
          id: p.id,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: p.type,
          parent_observation_id: p.parentId,
          name: p.name,
          start_time: traceStart + p.start,
          end_time: traceStart + p.end,
          completion_start_time:
            p.ttft !== undefined ? traceStart + p.start + p.ttft : null,
          level: p.level ?? "DEFAULT",
          status_message: p.statusMessage ?? null,
          version: null,
          input:
            p.rawInput ??
            (p.input !== undefined ? JSON.stringify(p.input) : null),
          output:
            p.rawOutput ??
            (p.output !== undefined ? JSON.stringify(p.output) : null),
          metadata: p.metadata,
          provided_model_name: p.model ?? null,
          internal_model_id: null,
          model_parameters: p.modelParameters
            ? JSON.stringify(p.modelParameters)
            : "{}",
          // Explicit empties for non-generations: the factory would otherwise
          // fill non-empty usage/cost defaults. Totals are what the session
          // header sums.
          ...(prices
            ? {
                provided_usage_details: {
                  input: usageInput,
                  output: usageOutput,
                  total: usageInput + usageOutput,
                },
                usage_details: {
                  input: usageInput,
                  output: usageOutput,
                  total: usageInput + usageOutput,
                },
                provided_cost_details: { input: inputCost, output: outputCost },
                cost_details: {
                  input: inputCost,
                  output: outputCost,
                  total: inputCost + outputCost,
                },
                total_cost: inputCost + outputCost,
              }
            : {
                provided_usage_details: {},
                usage_details: {},
                provided_cost_details: {},
                cost_details: {},
                total_cost: null,
              }),
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );
    }

    // The next turn resends the final answer, not the intermediate steps —
    // in the shape the model returned it (content and refusal stay separate
    // fields), which is what lets the timeline recognize it as history.
    const last = lastLlmStep(turn);
    const turnStart = history.findIndex(
      (message) =>
        message.role === "user" &&
        message.name === turn.sender &&
        message.content === turn.message,
    );
    history.splice(turnStart + 1);
    history.push({
      role: "assistant",
      content: last?.text ?? null,
      ...(last?.refusal ? { refusal: last.refusal } : {}),
    });
  });

  // Postgres ids are global rather than per project, so they carry the project
  // id: the same --id-prefix seeded into two projects must not share rows.
  const postgresId = (suffix: string) => `${ctx.projectId}-${suffix}`;
  // One project-level config, as for real annotation scores: the Annotate
  // panel only renders ANNOTATION scores whose config_id resolves.
  const severityConfigId = postgresId("incident-severity-config");

  const scoreTimestamp = sessionStart + 57 * MINUTE;
  const scores: ScoreRecordInsertType[] = [
    createSessionScore({
      id: `${sessionId}-score-severity`,
      project_id: ctx.projectId,
      session_id: sessionId,
      environment: ctx.environment,
      name: SEVERITY_CONFIG.name,
      value: 2,
      string_value: "SEV-2",
      data_type: "CATEGORICAL",
      source: "ANNOTATION",
      config_id: severityConfigId,
      comment: "Customer-facing checkout degradation for 18 min; no data loss.",
      metadata: { reviewer: "maya.okafor" },
      timestamp: scoreTimestamp,
    }),
    createSessionScore({
      id: `${sessionId}-score-mitigation`,
      project_id: ctx.projectId,
      session_id: sessionId,
      environment: ctx.environment,
      name: "time-to-mitigate-min",
      value: 18,
      data_type: "NUMERIC",
      source: "API",
      comment: null,
      metadata: {},
      timestamp: scoreTimestamp,
    }),
    createSessionScore({
      id: `${sessionId}-score-helpfulness`,
      project_id: ctx.projectId,
      session_id: sessionId,
      environment: ctx.environment,
      name: "copilot-helpfulness",
      value: 0.92,
      data_type: "NUMERIC",
      source: "EVAL",
      comment:
        "Named the causal deploy in its first reply and correctly called the pod crash unrelated.",
      metadata: { judge_model: "gpt-5.4", rubric: "incident-copilot-v2" },
      timestamp: scoreTimestamp,
    }),
    createSessionScore({
      id: `${sessionId}-score-postmortem`,
      project_id: ctx.projectId,
      session_id: sessionId,
      environment: ctx.environment,
      name: "postmortem-filed",
      value: 1,
      // score_booleans filters on the True/False string
      string_value: "True",
      data_type: "BOOLEAN",
      source: "API",
      comment: null,
      metadata: {},
      timestamp: scoreTimestamp,
    }),
    createTraceScore({
      id: `${traceIds[0]}-score-feedback`,
      project_id: ctx.projectId,
      trace_id: traceIds[0],
      environment: ctx.environment,
      name: "user-feedback",
      value: 1,
      string_value: "True",
      data_type: "BOOLEAN",
      source: "API",
      comment: "Found it in 15 seconds 🙌",
      metadata: {},
      timestamp: sessionStart + 30_000,
    }),
    createTraceScore({
      id: `${traceIds[5]}-score-feedback`,
      project_id: ctx.projectId,
      trace_id: traceIds[5],
      environment: ctx.environment,
      name: "user-feedback",
      value: 0,
      string_value: "False",
      data_type: "BOOLEAN",
      source: "API",
      comment: "Just wanted a quick yes or no",
      metadata: {},
      timestamp: sessionStart + TURNS[5].atMs + 20_000,
    }),
  ];

  const comments = [
    {
      id: postgresId(`${sessionId}-comment-1`),
      objectType: "SESSION" as const,
      objectId: sessionId,
      authorUserId: "user-1",
      content:
        "Great example for the on-call training deck: the copilot named the causal deploy in its first reply.",
    },
    {
      id: postgresId(`${sessionId}-comment-2`),
      objectType: "SESSION" as const,
      objectId: sessionId,
      authorUserId: "user-2",
      content:
        "Turn 6 is exactly the behavior we want — refusal plus a concrete change-request path. Adding it to the eval dataset.",
    },
    {
      id: postgresId(`${sessionId}-comment-3`),
      objectType: "TRACE" as const,
      objectId: traceIds[2],
      authorUserId: "user-1",
      content:
        "The CrashLoopBackOff was the node drain, not the rollback — correctly called out.",
    },
  ];

  const events: EventRecordInsertType[] = withV4
    ? [
        ...traces.map((trace) => traceToEvent(trace)),
        ...observations.map((observation) =>
          observationToEvent(
            observation,
            traces.find((trace) => trace.id === observation.trace_id)!,
          ),
        ),
      ]
    : [];

  ctx.log(
    `writing 1 session, ${traces.length} traces, ${observations.length} observations, ${scores.length} scores, ${comments.length} comments${
      withV4 ? `, ${events.length} events` : ""
    }`,
  );

  // The v3 session page needs the trace_sessions row; v4 reads it for
  // bookmark/public state.
  await prisma.traceSession.upsert({
    where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
    update: {},
    create: {
      id: sessionId,
      projectId: ctx.projectId,
      environment: ctx.environment,
      createdAt: new Date(sessionStart),
    },
  });
  const severityConfig = {
    name: SEVERITY_CONFIG.name,
    dataType: "CATEGORICAL" as const,
    categories: SEVERITY_CONFIG.categories,
    description: SEVERITY_CONFIG.description,
    isArchived: false,
  };
  await prisma.scoreConfig.upsert({
    where: { id: severityConfigId },
    update: severityConfig,
    create: {
      id: severityConfigId,
      projectId: ctx.projectId,
      ...severityConfig,
    },
  });
  for (const comment of comments) {
    await prisma.comment.upsert({
      where: { id: comment.id },
      update: { content: comment.content, authorUserId: comment.authorUserId },
      create: { ...comment, projectId: ctx.projectId },
    });
  }

  await createTracesCh(traces);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(scores);
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id = {sessionId: String}`,
      { projectId: ctx.projectId, sessionId },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND id IN {scoreIds: Array(String)}`,
      { projectId: ctx.projectId, scoreIds: scores.map((score) => score.id) },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND session_id = {sessionId: String}`,
      { projectId: ctx.projectId, sessionId },
      "uniqExact(span_id)",
    );
  }

  const expected: Record<string, number> = {
    traces: traces.length,
    observations: observations.length,
    scores: scores.length,
    ...(withV4 ? { events: events.length } : {}),
  };
  for (const [key, count] of Object.entries(expected)) {
    if ((verified[key] ?? 0) < count) {
      throw new SeedError(
        `Readback mismatch: expected ${count} ${key}, found ${verified[key] ?? 0}`,
      );
    }
  }

  return {
    scenario: "incident-session",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [sessionId],
    counts: {
      sessions: 1,
      traces: traces.length,
      observations: observations.length,
      scores: scores.length,
      comments: comments.length,
      scoreConfigs: 1,
      events: events.length,
    },
    verified,
    links: [
      sessionLink(ctx, sessionId),
      traceLink(ctx, traceIds[0], sessionStart),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const incidentSessionScenario: ScenarioDefinition = {
  name: "incident-session",
  description:
    "One demo-grade, fully handcrafted multi-user SESSION for the session timeline: an on-call copilot working a checkout-latency incident with four engineers over seven turns — parallel and untraced tool calls, a WARNING and an ERROR tool with a retry, a TOOL delegating to a nested sub-agent, reasoning, markdown answers, a guardrail-flagged refusal, three models with costs, typed session scores (API/EVAL/ANNOTATION) and session/trace comments. Deterministic; the id prefix is the session id. Built for videos/screenshots.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: the session timeline is v4-only)",
    },
  ],
  run,
};
