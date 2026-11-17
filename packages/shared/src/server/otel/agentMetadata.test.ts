import { describe, expect, it } from "vitest";
import { idSchema } from "../ingestion/types";
import {
  agentSpanKey,
  extractAgentIdentity,
  resolveAgentBatchIdentity,
  type AgentSpan,
} from "./agentMetadata";

const span = (overrides: Partial<AgentSpan> = {}): AgentSpan => ({
  traceId: "trace",
  spanId: "run",
  parentSpanId: null,
  name: "Observed agent",
  isAgent: true,
  attributes: {},
  ...overrides,
});

describe("agent metadata boundaries", () => {
  it("uses independent native precedence, preserving exact IDs and names", () => {
    expect(
      extractAgentIdentity(
        span({
          attributes: {
            "langfuse.agent.id": "  Stable ID  ",
            "gen_ai.agent.id": "other",
            "langfuse.agent.name": " ",
            "gen_ai.agent.name": "Research / résumé?",
          },
        }),
      ),
    ).toMatchObject({
      ["id"]: "  Stable ID  ",
      ["name"]: "Research / résumé?",
      ["source"]: "native",
      ["runId"]: "run",
    });
  });

  it("only falls back to an observation name for a recognized agent", () => {
    expect(extractAgentIdentity(span())).toMatchObject({
      ["name"]: "Observed agent",
      ["source"]: "span-name",
    });
    expect(extractAgentIdentity(span({ isAgent: false }))).toEqual({});
  });

  it("rejects a non-agent's explicit ownership reference to itself", () => {
    const malformed = span({
      isAgent: false,
      attributes: {
        "gen_ai.agent.id": "stable",
        "langfuse.agent.run_id": "run",
      },
    });
    expect(extractAgentIdentity(malformed)).not.toHaveProperty("runId");
    expect(
      resolveAgentBatchIdentity([malformed, span({ spanId: "outer" })]).get(
        agentSpanKey("trace", "run"),
      ),
    ).not.toHaveProperty("runId");
  });

  it("does not count agent creation as an agent run", () => {
    expect(
      extractAgentIdentity(
        span({
          attributes: {
            "gen_ai.operation.name": "create_agent",
            "langfuse.agent.run_id": "stale-parent",
          },
        }),
      ),
    ).not.toHaveProperty("runId");
  });

  it("bounds Unicode without truncating or merging oversized explicit IDs", () => {
    const boundary = extractAgentIdentity(
      span({
        attributes: {
          "gen_ai.agent.id": "界".repeat(256),
          "gen_ai.agent.name": "界".repeat(200),
        },
      }),
    );
    expect(boundary["id"]).toHaveLength(256);
    expect(
      extractAgentIdentity(
        span({
          attributes: {
            "langfuse.agent.id": "界".repeat(257),
            "gen_ai.agent.id": "fallback",
            "gen_ai.agent.name": "valid",
          },
        }),
      ),
    ).toEqual({});
    const validId = extractAgentIdentity(
      span({
        attributes: {
          "gen_ai.agent.id": "stable",
          "gen_ai.agent.name": "界".repeat(201),
        },
      }),
    );
    expect(validId["id"]).toBe("stable");
    expect(validId).not.toHaveProperty("name");
  });

  it("keeps supported legacy parent IDs independent from the shorter logical identity limit", () => {
    const owner = "r".repeat(800);
    expect(idSchema.safeParse("🦉".repeat(800)).success).toBe(true);
    expect(idSchema.safeParse("🦉".repeat(801)).success).toBe(false);
    const root = span({
      spanId: owner,
      attributes: { "gen_ai.agent.id": "stable" },
    });
    const leaf = span({
      isAgent: false,
      spanId: "model",
      parentSpanId: owner,
      attributes: {
        "gen_ai.agent.id": "stable",
        "langfuse.agent.run_id": owner,
      },
    });
    expect(extractAgentIdentity(leaf)["runId"]).toBe(owner);
    expect(
      resolveAgentBatchIdentity([leaf, root]).get(
        agentSpanKey("trace", "model"),
      )?.["runId"],
    ).toBe(owner);
    expect(
      extractAgentIdentity(
        span({
          ...leaf,
          attributes: {
            "gen_ai.agent.id": "stable",
            "langfuse.agent.run_id": "r".repeat(801),
          },
        }),
      ),
    ).not.toHaveProperty("runId");
    expect(
      extractAgentIdentity(
        span({
          ...leaf,
          attributes: {
            "gen_ai.agent.id": "stable",
            "langfuse.agent.run_id": "🦉".repeat(800),
          },
        }),
      )["runId"],
    ).toBe("🦉".repeat(800));
    expect(
      extractAgentIdentity(
        span({
          ...leaf,
          attributes: {
            "gen_ai.agent.id": "stable",
            "langfuse.agent.run_id": "🦉".repeat(801),
          },
        }),
      ),
    ).not.toHaveProperty("runId");
  });

  it("keeps explicit references when their parent is outside the batch", () => {
    const leaf = span({
      isAgent: false,
      spanId: "model",
      parentSpanId: "missing",
      attributes: {
        "gen_ai.agent.id": "stable",
        "langfuse.agent.run_id": "external-run",
      },
    });
    expect(
      resolveAgentBatchIdentity([leaf]).get(agentSpanKey("trace", "model")),
    ).toMatchObject({ ["id"]: "stable", ["runId"]: "external-run" });
  });

  it("does not infer an owner across traces, cyclic ancestry or invalid nested agents", () => {
    const root = span({ attributes: { "gen_ai.agent.id": "outer" } });
    const foreign = span({
      traceId: "other-trace",
      spanId: "model",
      parentSpanId: "run",
      isAgent: false,
    });
    const invalid = span({
      spanId: "invalid",
      parentSpanId: "run",
      attributes: { "gen_ai.agent.id": "x".repeat(257) },
    });
    const leaf = span({
      spanId: "leaf",
      parentSpanId: "invalid",
      isAgent: false,
    });
    const cycle = span({
      spanId: "cycle",
      parentSpanId: "cycle",
      isAgent: false,
    });
    const result = resolveAgentBatchIdentity([
      foreign,
      leaf,
      cycle,
      invalid,
      root,
    ]);
    for (const row of [foreign, cycle])
      expect(result.get(agentSpanKey(row.traceId, row.spanId))).toBeNull();
    expect(result.get(agentSpanKey(leaf.traceId, leaf.spanId))).toEqual({});
  });

  it("does not attach an explicitly different identity to a nearby agent run", () => {
    const leaf = span({
      isAgent: false,
      spanId: "model",
      parentSpanId: "run",
      attributes: {
        "gen_ai.agent.id": "different",
        "langfuse.agent.run_id": "run",
      },
    });
    const result = resolveAgentBatchIdentity([
      leaf,
      span({ attributes: { "gen_ai.agent.id": "outer" } }),
    ]);
    expect(result.get(agentSpanKey("trace", "model"))).toMatchObject({
      ["id"]: "different",
    });
    expect(result.get(agentSpanKey("trace", "model"))).not.toHaveProperty(
      "runId",
    );
  });
});
