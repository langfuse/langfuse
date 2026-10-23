// @vitest-environment node

import { describe, expect, it } from "vitest";
import { corners, project } from "../../engine/projection";
import { AGENTS_DEFAULTS, type AgentsContent } from "./content";
import { activeAgentIndex, layoutAgents } from "./layout";

const layoutOf = (content: Partial<AgentsContent> = {}) =>
  layoutAgents({ ...AGENTS_DEFAULTS, ...content });

describe("layoutAgents", () => {
  it("lands each span as its tool call's packet arrives, one call after another", () => {
    const { rows, next } = layoutOf();

    rows.forEach((row) =>
      expect(row.arriveAt).toBe(row.departAt + row.packet.duration),
    );
    rows
      .slice(1)
      .forEach((row, index) =>
        expect(row.arriveAt).toBeGreaterThan(rows[index]!.arriveAt),
      );
    expect(next.at).toBeGreaterThan(rows.at(-1)!.arriveAt);
  });

  it("keeps every span clear of the raised agent, whose sides hang below its face", () => {
    const { hero, rows } = layoutOf();
    const faceBottom = Math.max(
      ...corners(hero.face).map((point) => project(point)[1]),
    );
    rows.forEach((row) => {
      const [left] = corners(row.card).map((point) => project(point));
      expect(left![1]).toBeGreaterThan(faceBottom);
    });
  });

  it("widens the agent block for its longest name", () => {
    expect(
      layoutOf({ agents: [{ name: "a-long-agent" }] }).hero.face.width,
    ).toBeGreaterThan(layoutOf({ agents: [{ name: "pi" }] }).hero.face.width);
  });

  it("falls back to one agent when none are given", () => {
    expect(layoutOf({ agents: [] }).agents.map((agent) => agent.text)).toEqual([
      "agent",
    ]);
  });
});

describe("activeAgentIndex", () => {
  it("shows the first agent at rest and the next one each run", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((runs) => activeAgentIndex(undefined, runs, 4)),
    ).toEqual([0, 0, 1, 2, 3, 0]);
  });

  it("keeps a pinned agent every run, wrapping indexes outside the list", () => {
    expect([1, 2, 3].map((runs) => activeAgentIndex(2, runs, 4))).toEqual([
      2, 2, 2,
    ]);
    expect(activeAgentIndex(5, 0, 4)).toBe(1);
    expect(activeAgentIndex(-1, 0, 4)).toBe(3);
  });
});
