// @vitest-environment node

import { describe, expect, it } from "vitest";
import { project } from "../../engine/projection";
import { HALO_DEFAULTS, type HaloContent } from "./content";
import { activeJobIndex, jobsOf, layoutHalo, layoutHaloJobs } from "./layout";

const layoutOf = (content: Partial<HaloContent> = {}) =>
  layoutHalo({ ...HALO_DEFAULTS, ...content });

describe("layoutHalo", () => {
  it("types the message, drops it into Halo, then lands each step and the result in turn", () => {
    const { drop, hero, rows, result } = layoutOf();

    expect(hero.pressAt).toBe(drop.at + drop.keyframes.duration);
    expect(rows[0]!.departAt).toBeGreaterThan(hero.pressAt);
    rows.forEach((row) =>
      expect(row.arriveAt).toBe(row.departAt + row.packet.duration),
    );
    rows
      .slice(1)
      .forEach((row, index) =>
        expect(row.arriveAt).toBeGreaterThan(rows[index]!.arriveAt),
      );
    expect(result.at).toBeGreaterThan(rows.at(-1)!.arriveAt);
  });

  it("keeps a run within 3 seconds when a long ask types out", () => {
    const [job] = HALO_DEFAULTS.jobs;
    expect(
      layoutOf({ jobs: [{ ...job!, ask: "x".repeat(80) }] }).runDuration,
    ).toBeLessThanOrEqual(3000);
  });

  it("keeps every step and the result clear of the raised Halo, whose sides hang below its face", () => {
    const { hero, rows, result } = layoutOf();
    const faceBottom = hero.face.y + hero.face.height;
    [...rows.map(({ card }) => card), result.card].forEach((card) => {
      // At the card's left end, the hero's front edge hangs its depth below the face; the card starts 6 px past it
      const [, frontEdge] = project([card.x, faceBottom]);
      const [, cardTop] = project([card.x, card.y]);
      expect(cardTop).toBeGreaterThan(frontEdge + hero.depth + 6);
    });
  });

  it("names what Halo did in its label, from the content", () => {
    expect(layoutOf().ariaLabel).toBe(
      'Halo, Langfuse\'s agent, takes your message "Set up an evaluator for helpfulness" and does it for you: Find your traces, Make an LLM judge, Run on 24 traces, ending with helpfulness 0.92',
    );
  });

  it("falls back to one job when none are given", () => {
    expect(jobsOf({ jobs: [] })).toHaveLength(1);
  });

  it("plays each job in turn, waiting for the longest run before a hover replays", () => {
    const { jobs, runDuration } = layoutHaloJobs(HALO_DEFAULTS);

    expect(jobs).toHaveLength(HALO_DEFAULTS.jobs.length);
    expect(runDuration).toBe(Math.max(...jobs.map((job) => job.runDuration)));
  });
});

describe("activeJobIndex", () => {
  it("shows the first job at rest and the next one each run, or the pinned one", () => {
    expect(
      [0, 1, 2, 3, 4].map((runs) => activeJobIndex(undefined, runs, 3)),
    ).toEqual([0, 0, 1, 2, 0]);
    expect([1, 2, 3].map((runs) => activeJobIndex(1, runs, 3))).toEqual([
      1, 1, 1,
    ]);
  });
});
