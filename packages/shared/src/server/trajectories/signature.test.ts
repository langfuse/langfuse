import { describe, it, expect } from "vitest";

import { extractTrajectory, stepToken, type TrajectoryNode } from "./signature";

/**
 * Trees are written as flat node lists because that is the shape ClickHouse
 * returns. `t` keeps the fixtures readable.
 */
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

/** The healthy docfraud path: router schedules every check. */
function healthyRun(prefix = ""): TrajectoryNode[] {
  return [
    t(`${prefix}root`, null, "CHAIN", "docfraud-review", 0),
    t(`${prefix}a1`, `${prefix}root`, "AGENT", "intake", 1),
    t(`${prefix}t1`, `${prefix}a1`, "TOOL", "extract_fields", 2),
    t(`${prefix}a2`, `${prefix}root`, "AGENT", "router", 3),
    t(`${prefix}a3`, `${prefix}root`, "AGENT", "provenance", 4),
    t(`${prefix}t2`, `${prefix}a3`, "TOOL", "check_metadata", 5),
    t(`${prefix}a4`, `${prefix}root`, "AGENT", "adjudicator", 6),
    t(`${prefix}t3`, `${prefix}a4`, "TOOL", "emit_verdict", 7),
  ];
}

describe("stepToken", () => {
  it("uppercases the type so ingestion casing cannot split a step", () => {
    expect(stepToken({ type: "agent", name: "router" })).toBe("AGENT:router");
    expect(stepToken({ type: "AGENT", name: "router" })).toBe("AGENT:router");
  });
});

describe("extractTrajectory", () => {
  it("handles an empty trace without throwing", () => {
    const features = extractTrajectory([]);
    expect(features.stepCount).toBe(0);
    expect(features.canonicalPath).toBe("");
    expect(features.steps).toEqual([]);
  });

  it("produces a canonical path that nests children under their parent", () => {
    const features = extractTrajectory(healthyRun());
    expect(features.canonicalPath).toBe(
      "CHAIN:docfraud-review(" +
        "AGENT:intake(TOOL:extract_fields)," +
        "AGENT:router," +
        "AGENT:provenance(TOOL:check_metadata)," +
        "AGENT:adjudicator(TOOL:emit_verdict))",
    );
  });

  it("is stable across runs that differ only in ids and timestamps", () => {
    const a = extractTrajectory(healthyRun("a-"));
    const b = healthyRun("b-").map((n) => ({
      ...n,
      startTime: (n.startTime as number) + 10_000,
    }));
    expect(extractTrajectory(b).signature).toBe(a.signature);
  });

  it("orders siblings by start time, not by input order", () => {
    const shuffled = [...healthyRun()].reverse();
    expect(extractTrajectory(shuffled).canonicalPath).toBe(
      extractTrajectory(healthyRun()).canonicalPath,
    );
  });

  it("falls back to id ordering when siblings share a start time", () => {
    const nodes = [
      t("root", null, "CHAIN", "r", 0),
      t("b", "root", "TOOL", "second", 5),
      t("a", "root", "TOOL", "first", 5),
    ];
    // Deterministic tie-break: "a" sorts before "b".
    expect(extractTrajectory(nodes).canonicalPath).toBe(
      "CHAIN:r(TOOL:first,TOOL:second)",
    );
  });

  it("collapses a retry storm into one step with a repeat count", () => {
    const nodes: TrajectoryNode[] = [
      t("root", null, "CHAIN", "docfraud-review", 0),
      t("a", "root", "AGENT", "provenance", 1),
      ...Array.from({ length: 6 }, (_, i) =>
        t(`r${i}`, "a", "TOOL", "check_metadata", 2 + i),
      ),
    ];
    const features = extractTrajectory(nodes);
    expect(features.canonicalPath).toBe(
      "CHAIN:docfraud-review(AGENT:provenance(TOOL:check_metadata*6))",
    );
    expect(features.maxRepeat).toBe(6);
    // Collapsing matters: without it the signature would encode the retry
    // count and every storm of a different length would look novel.
    expect(features.steps).toEqual([
      "AGENT:provenance",
      "CHAIN:docfraud-review",
      "TOOL:check_metadata",
    ]);
  });

  it("attributes repeats to the step that repeated", () => {
    // Two different steps repeating different numbers of times in one run.
    // A single per-run maximum would report 8 and lose the fact that a tool
    // retried at all - which is what let a common repeat-heavy mode mask a
    // rarer one before repeats were tracked per step.
    const nodes: TrajectoryNode[] = [
      t("root", null, "CHAIN", "docfraud-review", 0),
      t("a", "root", "AGENT", "provenance", 1),
      ...Array.from({ length: 3 }, (_, i) =>
        t(`r${i}`, "a", "TOOL", "check_metadata", 2 + i),
      ),
      t("adj", "root", "AGENT", "adjudicator", 20),
      ...Array.from({ length: 8 }, (_, i) =>
        t(`g${i}`, "adj", "GENERATION", "adjudicator", 21 + i),
      ),
    ];
    const features = extractTrajectory(nodes);
    expect(features.repeatsByStep).toEqual({
      "GENERATION:adjudicator": 8,
      "TOOL:check_metadata": 3,
    });
    expect(features.maxRepeat).toBe(8);
  });

  it("records no repeats for a run where nothing repeated", () => {
    expect(extractTrajectory(healthyRun()).repeatsByStep).toEqual({});
  });

  it("distinguishes an agent from a tool of the same name", () => {
    const asAgent = extractTrajectory([
      t("root", null, "CHAIN", "r", 0),
      t("x", "root", "AGENT", "review", 1),
    ]);
    const asTool = extractTrajectory([
      t("root", null, "CHAIN", "r", 0),
      t("x", "root", "TOOL", "review", 1),
    ]);
    expect(asAgent.signature).not.toBe(asTool.signature);
  });

  it("records depth, fan-out and edges", () => {
    const features = extractTrajectory(healthyRun());
    expect(features.depth).toBe(3); // root -> agent -> tool
    expect(features.maxFanout).toBe(4); // root has four agents
    expect(features.edges).toContain("CHAIN:docfraud-review>AGENT:intake");
    expect(features.edges).toContain("AGENT:adjudicator>TOOL:emit_verdict");
  });

  it("counts ERROR and WARNING observations, ignoring DEFAULT", () => {
    const nodes = [
      t("root", null, "CHAIN", "r", 0),
      t("a", "root", "TOOL", "x", 1, "ERROR"),
      t("b", "root", "TOOL", "y", 2, "warning"),
      t("c", "root", "TOOL", "z", 3, "DEFAULT"),
    ];
    expect(extractTrajectory(nodes).errorCount).toBe(2);
  });

  it("promotes orphans to roots so a partial trace still yields a signature", () => {
    const nodes = [
      t("a", "missing-parent", "AGENT", "intake", 1),
      t("b", "a", "TOOL", "extract_fields", 2),
    ];
    const features = extractTrajectory(nodes);
    expect(features.canonicalPath).toBe("AGENT:intake(TOOL:extract_fields)");
    expect(features.stepCount).toBe(2);
  });

  it("gives a hijacked run a different signature from a healthy one", () => {
    // The injection case: the router schedules nothing and the adjudicator
    // emits a verdict with no evidence behind it.
    const hijacked = [
      t("root", null, "CHAIN", "docfraud-review", 0),
      t("a1", "root", "AGENT", "intake", 1),
      t("t1", "a1", "TOOL", "extract_fields", 2),
      t("a2", "root", "AGENT", "router", 3),
      t("a4", "root", "AGENT", "adjudicator", 4),
      t("t3", "a4", "TOOL", "emit_verdict", 5),
    ];
    expect(extractTrajectory(hijacked).signature).not.toBe(
      extractTrajectory(healthyRun()).signature,
    );
  });

  it("does not overflow the stack on a deeply nested trace", () => {
    const nodes: TrajectoryNode[] = [t("n0", null, "CHAIN", "root", 0)];
    for (let i = 1; i < 20_000; i++) {
      nodes.push(t(`n${i}`, `n${i - 1}`, "SPAN", "step", i));
    }
    const features = extractTrajectory(nodes);
    expect(features.depth).toBe(20_000);
    expect(features.stepCount).toBe(20_000);
  });
});
