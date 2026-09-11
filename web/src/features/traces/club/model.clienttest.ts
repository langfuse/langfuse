import { describe, expect, it } from "vitest";
import { prepareClubScore, sampleClubScore, roomChannels } from "./model";
import { type TreeNode } from "../types/treeNode";

function node(
  id: string,
  type: TreeNode["type"],
  start: number,
  end: number,
  children: TreeNode[] = [],
): TreeNode {
  return {
    id,
    type,
    name: id,
    startTime: new Date(start * 1000),
    endTime: new Date(end * 1000),
    children,
    depth: 2,
    childrenDepth: 0,
    startTimeSinceTrace: start * 1000,
    startTimeSinceParentStart: null,
  };
}

describe("trace club score", () => {
  it("recognizes Agentique's v3 Légifrance tool spans without relabeling ordinary spans", () => {
    const score = prepareClubScore(
      [node("legifrance.search", "SPAN", 0, 1), node("research", "SPAN", 0, 1)],
      new Date(0),
      1,
      "agentique",
    );
    expect(
      score.observations.find((item) => item.id === "legifrance.search")!.role,
    ).toBe("TOOL");
    expect(
      score.observations.find((item) => item.id === "legifrance.search")!.type,
    ).toBe("SPAN");
    expect(
      score.observations.find((item) => item.id === "research")!.type,
    ).toBe("SPAN");
    expect(sampleClubScore(score, 0.5).tool).toBeGreaterThan(0);
  });
  it("uses observation timing, nesting and types, excluding the synthetic trace wrapper", () => {
    const roots = [
      node("trace", "TRACE", 0, 10, [
        node("llm", "GENERATION", 1, 4),
        node("tool", "TOOL", 5, 8),
      ]),
    ];
    const score = prepareClubScore(roots, new Date(0), 10, "trace");
    expect(score.observations.map((item) => item.id)).toEqual(["llm", "tool"]);
    expect(sampleClubScore(score, 2).generation).toBeGreaterThan(0);
    expect(sampleClubScore(score, 2).tool).toBe(0);
    expect(sampleClubScore(score, 6).tool).toBeGreaterThan(0);
    expect(sampleClubScore(score, 6).generation).toBe(0);
    expect(sampleClubScore(score, 9).active).toEqual([]);
  });

  it("repeats the same score when seeking and makes zero-length events visible", () => {
    const score = prepareClubScore(
      [node("instant", "TOOL", 1, 1)],
      new Date(0),
      10,
      "trace",
    );
    const first = sampleClubScore(score, 1.001);
    sampleClubScore(score, 8);
    expect(sampleClubScore(score, 1.001)).toEqual(first);
    expect(first.active).toHaveLength(1);
  });

  it("takes bureaucratic stages and article inscriptions from active observations", () => {
    const score = prepareClubScore(
      [
        node("verify.529", "SPAN", 0, 0.5),
        node("verify.L3121-16", "SPAN", 1, 3),
        node("structured.verify", "SPAN", 2, 4),
        node("answer", "GENERATION", 4, 6),
        node("legifrance.search", "SPAN", 7, 9),
      ],
      new Date(0),
      10,
      "legal-trace",
    );
    const checking = sampleClubScore(score, 2.5);
    expect(checking.stageLabel).toBe("CONTRÔLE");
    expect(checking.articleLabel).toBe("ARTICLE L3121-16");
    expect(checking.verification).toBeGreaterThan(
      sampleClubScore(score, 1.5).verification,
    );
    expect(sampleClubScore(score, 5).stageLabel).toBe("DÉLIBÉRATION");
    expect(sampleClubScore(score, 8).stageLabel).toBe("RECHERCHE");
    expect(sampleClubScore(score, 8).articleLabel).toBe("");
    expect(score.inscriptions).toContain("ARTICLE L3121-16");
    expect(sampleClubScore(score, 0.2).articleLabel).toBe("ARTICLE 529");
    expect(score.inscriptions).toContain("structured.verify");
    expect(score.inscriptions).not.toContain("ARTICLE 999");
    expect(checking.legalSeed).toBe(sampleClubScore(score, 8).legalSeed);
  });

  it("makes repeated searches add pressure, with decay when the searches finish", () => {
    const search = (id: string, start: number) => ({
      ...node(id, "SPAN", start, start + 0.01),
      name: "legifrance.search",
    });
    const repeated = prepareClubScore(
      [search("one", 20), search("two", 21), search("three", 22)],
      new Date(0),
      100,
      "pressure",
    );
    const isolated = prepareClubScore(
      [search("three", 22)],
      new Date(0),
      100,
      "pressure",
    );
    expect(sampleClubScore(repeated, 22.05).bureaucracy).toBeGreaterThan(
      sampleClubScore(isolated, 22.05).bureaucracy,
    );
    expect(sampleClubScore(repeated, 30).bureaucracy).toBe(0);
    expect(sampleClubScore(repeated, 22.1).active).toHaveLength(1);
    const beforeSeek = sampleClubScore(repeated, 22.05);
    sampleClubScore(repeated, 30);
    expect(sampleClubScore(repeated, 22.05)).toEqual(beforeSeek);
  });

  it("keeps malformed measurements finite and does not invent article references", () => {
    const score = prepareClubScore(
      [
        { ...node("invalid", "SPAN", Number.NaN, 1), depth: Infinity },
        {
          ...node("verify.response", "SPAN", 0, Number.NaN),
          depth: Number.NaN,
          totalUsage: Infinity,
        },
      ],
      new Date(0),
      Infinity,
      "malformed",
    );
    expect(score.duration).toBe(0);
    expect(score.observations).toHaveLength(1);
    const frame = sampleClubScore(score, Number.NaN);
    expect(frame.articleLabel).toBe("");
    for (const key of [
      "progress",
      "beat",
      "pulse",
      "depth",
      "energy",
      "tension",
      "generation",
      "tool",
      "bureaucracy",
      "verification",
      "legalSeed",
    ] as const) {
      expect(Number.isFinite(frame[key])).toBe(true);
    }
    for (const key of [
      "energy",
      "tension",
      "bureaucracy",
      "verification",
    ] as const) {
      expect(frame[key]).toBeGreaterThanOrEqual(0);
      expect(frame[key]).toBeLessThanOrEqual(1);
    }
  });

  it("handles an empty trace and bounds all six hardware channels", () => {
    const frame = sampleClubScore(
      prepareClubScore([], new Date(0), 0, "empty"),
      0,
    );
    expect(frame.progress).toBe(0);
    expect(frame.active).toEqual([]);
    expect(roomChannels(frame, 0)).toEqual([0, 0, 0, 0, 0, 0]);
    for (const value of roomChannels(
      { ...frame, energy: 1, tension: 1, generation: 1, tool: 1 },
      1,
    )) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
  });
});
