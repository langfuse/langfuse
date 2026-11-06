// @vitest-environment node

import { describe, expect, it } from "vitest";
import { corners, project } from "../../engine/projection";
import { AGENTS_DEFAULTS, type AgentsContent } from "./content";
import { layoutAgents } from "./layout";

const layoutOf = (content: Partial<AgentsContent> = {}) =>
  layoutAgents({ ...AGENTS_DEFAULTS, ...content });

describe("layoutAgents", () => {
  it("lands each span as its tool call's packet arrives, one call after another", () => {
    const { rows, next } = layoutOf();
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

  it("names a pinned agent outside the list as the one it wraps to", () => {
    const { active, ariaLabel } = layoutOf({ active: 5 });

    expect(active).toBe(1);
    expect(ariaLabel).toContain(": codex calls");
  });

  it("falls back to one agent when none are given", () => {
    expect(layoutOf({ agents: [] }).agents.map((agent) => agent.text)).toEqual([
      "agent",
    ]);
  });
});
