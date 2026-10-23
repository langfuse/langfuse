import type { DemoTurn, FirstTrace, FirstTraceNode } from "../../types";

const at = (ms: number) => new Date(Date.UTC(2026, 9, 21, 9, 0, 0) + ms);

/** A step of a fixture trace, from `startMs` to `endMs` after the trace began. */
const node = (
  id: string,
  type: FirstTraceNode["type"],
  name: string,
  [startMs, endMs]: [number, number],
  details: Pick<FirstTraceNode, "model" | "level" | "statusMessage"> = {},
  children: FirstTraceNode[] = [],
): FirstTraceNode => ({
  id,
  type,
  name,
  startTime: at(startMs),
  endTime: at(endMs),
  children,
  ...details,
});

/** A small RAG call: retrieve, embed the query, then answer. */
const ragTrace = (
  id: string,
  [answerStartMs, endMs]: [number, number],
  answer: Pick<FirstTraceNode, "model" | "level" | "statusMessage">,
) => [
  node(`${id}-root`, "SPAN", "chat-completion", [0, endMs], {}, [
    node(`${id}-retrieve`, "RETRIEVER", "retrieve-context", [10, 190], {}, [
      node(`${id}-embed`, "EMBEDDING", "embed-query", [12, 70], {
        model: "text-embedding-3-small",
      }),
    ]),
    node(
      `${id}-answer`,
      "GENERATION",
      "openai.chat",
      [answerStartMs, endMs],
      answer,
    ),
  ]),
];

export const appTrace: FirstTrace = {
  id: "trace-1",
  name: "chat-completion",
  href: "#trace-1",
  source: { kind: "app" },
  totalTokens: 1284,
  costUsd: 0.0021,
  io: {
    input: "What's our refund policy for annual plans?",
    output:
      "Annual plans can be refunded in full within 30 days of purchase, and pro rata after that.",
  },
  roots: ragTrace("t1", [200, 1240], { model: "gpt-4o-mini" }),
};

export const errorTrace: FirstTrace = {
  ...appTrace,
  costUsd: 0.000012,
  io: { input: "What's our refund policy for annual plans?", output: "—" },
  roots: ragTrace("t3", [200, 420], {
    model: "gpt-4o-mini",
    level: "ERROR",
    statusMessage: "429 Too Many Requests: rate limit reached for gpt-4o-mini",
  }),
};

/** Instrumented by hand with spans only, so nothing marks the LLM call as one. */
export const spansOnlyTrace: FirstTrace = {
  ...appTrace,
  costUsd: null,
  totalTokens: 0,
  roots: [
    node("s-root", "SPAN", "handle-request", [0, 1180], {}, [
      node("s-search", "SPAN", "search-docs", [10, 160]),
      node("s-llm", "SPAN", "call-llm", [170, 1170]),
    ]),
  ],
};

export const unpricedTrace: FirstTrace = {
  ...appTrace,
  costUsd: null,
  roots: ragTrace("t4", [200, 1180], { model: "acme-support-ft-v2" }),
};

/** A research agent's loop: plan, search, read, thirteen times over. */
export const largeTrace: FirstTrace = {
  ...appTrace,
  name: "research-agent",
  totalTokens: 48210,
  costUsd: 0.0912,
  io: {
    input: "Compare the three cheapest vector databases for 10M embeddings.",
    output: "For 10M embeddings at 1536 dimensions, the cheapest three are…",
  },
  roots: [
    node(
      "l-root",
      "AGENT",
      "research-agent",
      [0, 9360],
      {},
      Array.from({ length: 13 }, (_, round) => {
        const startMs = round * 720;
        return [
          node(
            `l-plan-${round}`,
            "GENERATION",
            "plan",
            [startMs, startMs + 300],
            {
              model: "gpt-4.1",
            },
          ),
          node(`l-search-${round}`, "TOOL", "web_search", [
            startMs + 300,
            startMs + 520,
          ]),
          node(`l-read-${round}`, "TOOL", "read_page", [
            startMs + 520,
            startMs + 700,
          ]),
        ];
      }).flat(),
    ),
  ],
};

/** A Claude Code turn as its plugin sends it: LLM calls and `Tool: <name>` spans under one root. */
const CLAUDE_CODE_STEPS = [
  "LLM Call",
  "Read",
  "Read",
  "Read",
  "LLM Call",
  "Edit",
  "Edit",
  "Read",
  "Read",
  "Read",
  "Bash",
  "LLM Call",
  "Edit",
  "Edit",
  "Edit",
  "Bash",
  "Bash",
];

export const agentTurn: FirstTrace = {
  id: "turn-1",
  name: "Claude Code Turn",
  href: "#turn-1",
  source: { kind: "agent", slug: "claude-code", sessionHref: "#session-1" },
  totalTokens: 31204,
  costUsd: 0.21,
  io: {
    input: "Add a retry with backoff to the upload client",
    output: "Added exponential backoff to UploadClient.send and a test for it.",
  },
  roots: [
    node(
      "c-root",
      "SPAN",
      "Conversational Turn",
      [0, 48200],
      {},
      CLAUDE_CODE_STEPS.map((step, index) =>
        step === "LLM Call"
          ? node(
              `c-${index}`,
              "GENERATION",
              step,
              [index * 2800, index * 2800 + 2400],
              {
                model: "claude-sonnet-4-5",
              },
            )
          : node(`c-${index}`, "TOOL", `Tool: ${step}`, [
              index * 2800,
              index * 2800 + 900,
            ]),
      ),
    ),
  ],
};

/** The demo app's answer to its first suggested question, as its trace. */
export const demoTrace: FirstTrace = {
  ...appTrace,
  id: "demo-1",
  name: "demo-chat",
  href: "#demo-1",
  io: {
    input: "What does Langfuse do?",
    output:
      "Langfuse records what your LLM app does, step by step, so you can debug it, measure cost and quality, and improve it.",
  },
};

export const answeredTurn: DemoTurn = {
  question: "What does Langfuse do?",
  answer: demoTrace.io?.output ?? null,
  trace: demoTrace,
};
