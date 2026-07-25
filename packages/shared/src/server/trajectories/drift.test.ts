import { describe, it, expect } from "vitest";

import {
  assessDrift,
  buildBaseline,
  MIN_BASELINE_RUNS,
  RULE_WEIGHTS,
} from "./drift";
import { extractTrajectory, type TrajectoryNode } from "./signature";

function t(
  id: string,
  parentId: string | null,
  type: string,
  name: string,
  startTime: number,
  level?: string,
): TrajectoryNode {
  return { id, parentId, type, name, startTime, level };
}

const CHECKS = ["provenance", "forensics", "consistency"] as const;

/** The healthy path: every check runs before the adjudicator decides. */
function healthy(opts: { withStylometry?: boolean } = {}): TrajectoryNode[] {
  const nodes: TrajectoryNode[] = [
    t("root", null, "CHAIN", "docfraud-review", 0),
    t("a1", "root", "AGENT", "intake", 1),
    t("g1", "a1", "GENERATION", "intake", 2),
    t("a2", "root", "AGENT", "router", 3),
    t("g2", "a2", "GENERATION", "router", 4),
  ];
  CHECKS.forEach((check, i) => {
    nodes.push(t(`c${i}`, "root", "AGENT", check, 10 + i));
    nodes.push(t(`ct${i}`, `c${i}`, "TOOL", `check_${check}`, 10.5 + i));
  });
  if (opts.withStylometry) {
    nodes.push(t("ai", "root", "AGENT", "ai_text", 20));
    nodes.push(t("ait", "ai", "TOOL", "score_text", 21));
  }
  nodes.push(t("adj", "root", "AGENT", "adjudicator", 30));
  nodes.push(t("adjg", "adj", "GENERATION", "adjudicator", 31));
  nodes.push(t("adjt", "adj", "TOOL", "emit_verdict", 32));
  return nodes;
}

/**
 * A realistic baseline: two legitimate paths, the stylometry variant being a
 * genuine minority rather than an anomaly.
 */
function realisticBaseline(runs = 200) {
  return buildBaseline(
    Array.from({ length: runs }, (_, i) =>
      extractTrajectory(healthy({ withStylometry: i % 3 === 0 })),
    ),
  );
}

describe("buildBaseline", () => {
  it("summarises signature shares and step frequency", () => {
    const baseline = realisticBaseline(300);
    expect(baseline.totalRuns).toBe(300);
    // Two legitimate paths, not one.
    expect(Object.keys(baseline.signatureCounts)).toHaveLength(2);
    // The adjudicator runs every time; stylometry does not.
    expect(baseline.stepFrequency["AGENT:adjudicator"]).toBe(1);
    expect(baseline.stepFrequency["AGENT:ai_text"]).toBeCloseTo(1 / 3, 1);
  });

  it("reports a zero error rate for a clean baseline", () => {
    expect(realisticBaseline().errorRunRate).toBe(0);
  });
});

describe("assessDrift", () => {
  it("refuses to judge against too small a baseline", () => {
    const tiny = buildBaseline(
      Array.from({ length: MIN_BASELINE_RUNS - 1 }, () =>
        extractTrajectory(healthy()),
      ),
    );
    const result = assessDrift(extractTrajectory(healthy()), tiny);
    expect(result.evaluated).toBe(false);
    expect(result.score).toBe(0);
  });

  it("scores an ordinary run as zero", () => {
    const result = assessDrift(
      extractTrajectory(healthy()),
      realisticBaseline(),
    );
    expect(result.evaluated).toBe(true);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("does not flag the legitimate minority path", () => {
    // The whole point of keeping two healthy paths in the baseline: a detector
    // that flags "not the most common path" would fire on a third of traffic.
    const result = assessDrift(
      extractTrajectory(healthy({ withStylometry: true })),
      realisticBaseline(),
    );
    expect(result.score).toBe(0);
  });

  it("flags a hijacked router that skipped every check", () => {
    const hijacked = [
      t("root", null, "CHAIN", "docfraud-review", 0),
      t("a1", "root", "AGENT", "intake", 1),
      t("g1", "a1", "GENERATION", "intake", 2),
      t("a2", "root", "AGENT", "router", 3),
      t("g2", "a2", "GENERATION", "router", 4),
      t("adj", "root", "AGENT", "adjudicator", 30),
      t("adjg", "adj", "GENERATION", "adjudicator", 31),
      t("adjt", "adj", "TOOL", "emit_verdict", 32),
    ];
    const result = assessDrift(
      extractTrajectory(hijacked),
      realisticBaseline(),
    );

    expect(result.score).toBeGreaterThanOrEqual(0.75);
    const rules = result.reasons.map((r) => r.rule);
    expect(rules).toContain("UNSEEN_SIGNATURE");
    expect(rules).toContain("MISSING_CORE_STEP");

    // The verdict has to name the checks that went missing.
    const missing = result.reasons.find((r) => r.rule === "MISSING_CORE_STEP");
    expect(missing?.detail).toContain("AGENT:provenance");
  });

  it("flags a retry storm through the repeat rule", () => {
    const storm = healthy().concat(
      Array.from({ length: 6 }, (_, i) =>
        t(
          `retry${i}`,
          "c0",
          "TOOL",
          "check_provenance",
          10.6 + i * 0.01,
          "ERROR",
        ),
      ),
    );
    const result = assessDrift(extractTrajectory(storm), realisticBaseline());
    const rules = result.reasons.map((r) => r.rule);
    expect(rules).toContain("EXCESS_REPEAT");
    expect(rules).toContain("UNEXPECTED_ERRORS");
    expect(result.score).toBeGreaterThan(0);
  });

  it("does not let a common repeat-heavy mode mask a rarer one", () => {
    // A baseline where 20% of runs fragment intake into 10 chunks, and a run
    // where a *tool* retried 6 times. Comparing a single per-run maximum would
    // ask "how many runs repeated at least 6 times", get 20%, and stay silent.
    // Per-step, TOOL:check_provenance has never repeated at all.
    const baselineRuns = Array.from({ length: 200 }, (_, i) => {
      const nodes = healthy();
      if (i % 5 === 0) {
        nodes.push(
          ...Array.from({ length: 10 }, (_, j) =>
            t(`chunk${j}`, "a1", "GENERATION", "intake", 2.1 + j * 0.01),
          ),
        );
      }
      return extractTrajectory(nodes);
    });
    const baseline = buildBaseline(baselineRuns);

    const storm = healthy().concat(
      Array.from({ length: 6 }, (_, i) =>
        t(`retry${i}`, "c0", "TOOL", "check_provenance", 10.6 + i * 0.01),
      ),
    );
    const result = assessDrift(extractTrajectory(storm), baseline);
    const repeat = result.reasons.find((r) => r.rule === "EXCESS_REPEAT");
    expect(repeat).toBeDefined();
    expect(repeat?.detail).toContain("TOOL:check_provenance");
  });

  it("flags a novel transition the pipeline has never made", () => {
    const rerouted = healthy().concat([
      // The adjudicator calls a forensic tool directly, bypassing its agent.
      t("weird", "adj", "TOOL", "check_forensics", 33),
    ]);
    const result = assessDrift(
      extractTrajectory(rerouted),
      realisticBaseline(),
    );
    expect(result.reasons.map((r) => r.rule)).toContain("UNSEEN_EDGE");
  });

  it("flags a cost blow-out as a step-count outlier", () => {
    const blowout = healthy().concat(
      Array.from({ length: 40 }, (_, i) =>
        t(`chunk${i}`, "a1", "GENERATION", `intake_chunk_${i}`, 2.1 + i * 0.01),
      ),
    );
    const result = assessDrift(extractTrajectory(blowout), realisticBaseline());
    expect(result.reasons.map((r) => r.rule)).toContain("STEP_COUNT_OUTLIER");
  });

  it("clamps the score at 1 when many rules fire together", () => {
    const chaos = [
      t("root", null, "CHAIN", "something-else", 0),
      ...Array.from({ length: 60 }, (_, i) =>
        t(`n${i}`, "root", "TOOL", "unknown_tool", 1 + i, "ERROR"),
      ),
    ];
    const result = assessDrift(extractTrajectory(chaos), realisticBaseline());
    expect(result.score).toBe(1);
  });

  it("weights an unseen path above a merely rare one", () => {
    expect(RULE_WEIGHTS.UNSEEN_SIGNATURE).toBeGreaterThan(
      RULE_WEIGHTS.RARE_SIGNATURE,
    );
  });

  it("treats a rare-but-known path as mild evidence", () => {
    const runs = Array.from({ length: 500 }, (_, i) =>
      extractTrajectory(healthy({ withStylometry: i < 2 })),
    );
    const baseline = buildBaseline(runs);
    const result = assessDrift(
      extractTrajectory(healthy({ withStylometry: true })),
      baseline,
    );
    expect(result.reasons.map((r) => r.rule)).toContain("RARE_SIGNATURE");
    expect(result.score).toBeLessThan(RULE_WEIGHTS.UNSEEN_SIGNATURE);
  });
});
