import {
  DEFAULT_AGENT_OPTIONS,
  encodeAgentOptions,
  resolveAgentOptions,
} from "./options";

describe("agent prototype option codecs", () => {
  it("keeps privacy previews off and uses the agreed default metric semantics", () => {
    expect(resolveAgentOptions({}).showIdentityBadges).toBe(false);
    expect(resolveAgentOptions({}).cardMetrics).toEqual([
      "sessions",
      "tools",
      "skills",
      "duration",
    ]);
  });
  it("lets explicit URL values override persisted defaults, including false", () => {
    const value = resolveAgentOptions(
      {
        agentBadges: "0",
        agentAttention: "0",
        agentsRelation: "available-tools",
        agentBaseline: "7",
        agentMetrics: "tools,skills,cost,tools,invalid",
      },
      { ...DEFAULT_AGENT_OPTIONS, showIdentityBadges: true },
    );
    expect(value.showIdentityBadges).toBe(false);
    expect(value.showAttention).toBe(false);
    expect(value.relationshipView).toBe("available-tools");
    expect(value.baselineDays).toBe(7);
    expect(value.cardMetrics).toEqual(["tools", "skills", "cost"]);
    expect(resolveAgentOptions(encodeAgentOptions(value))).toEqual(value);
  });
  it("rejects unknown URL values and never leaves cards without metrics", () => {
    expect(
      resolveAgentOptions({
        agentsView: "arbitrary",
        agentChart: "broken",
        agentMetrics: "not-a-metric",
        agentBaseline: 100,
      }),
    ).toEqual(DEFAULT_AGENT_OPTIONS);
  });
});
