import { describe, expect, it, vi } from "vitest";
vi.mock("../../server/test-utils/clickhouse-helpers", () => ({
  createEventsCh: vi.fn(),
}));
vi.mock("../../../scripts/seeder/scenarios/verify", async (original) => ({
  ...(await original<
    typeof import("../../../scripts/seeder/scenarios/verify")
  >()),
  countRows: vi.fn(),
}));
import {
  agentsMvpScenario,
  buildAgentsMvpFixture,
} from "../../../scripts/seeder/scenarios/agents-mvp";
import { countRows } from "../../../scripts/seeder/scenarios/verify";

const context = {
  projectId: "fixture-project",
  environment: "production",
  seed: 42,
  idPrefix: "agents-mvp-fixture",
  dryRun: true,
  baseUrl: "http://localhost:3017",
  log() {},
};
const params = { runs: 80, date: "2026-11-05" };

describe("Agents MVP deterministic telemetry fixture", () => {
  it("includes every generated trace namespace in the post-write readback", async () => {
    const fixture = buildAgentsMvpFixture(context, params);
    vi.mocked(countRows).mockResolvedValueOnce(fixture.runs);
    const result = await agentsMvpScenario.run(
      { ...context, dryRun: false },
      params,
    );
    const queryParams = vi.mocked(countRows).mock.calls.at(-1)![2];
    const prefix = String(queryParams.prefix).slice(0, -1);
    expect(
      fixture.events.every((event) => event.trace_id.startsWith(prefix)),
    ).toBe(true);
    expect(result.verified.runs).toBe(fixture.runs);
  });
  it("preserves stable storage keys across reruns and includes all eight identities", () => {
    const a = buildAgentsMvpFixture(context, params);
    const b = buildAgentsMvpFixture(context, params);
    expect(
      a.events.map((row) => [
        row.trace_id,
        row.span_id,
        row.start_time,
        row.type,
      ]),
    ).toEqual(
      b.events.map((row) => [
        row.trace_id,
        row.span_id,
        row.start_time,
        row.type,
      ]),
    );
    expect(
      new Set(
        a.events
          .filter((row) => row.type === "AGENT")
          .map((row) => row.agent_name),
      ).size,
    ).toBe(8);
  });

  it("contains the exact parent/leaf double-counting trap and complete per-invocation ownership", () => {
    const { events } = buildAgentsMvpFixture(context, params);
    const root = events.find(
      (row) => row.span_id === `${context.idPrefix}-run-0`,
    )!;
    const models = events.filter(
      (row) => row.trace_id === root.trace_id && row.type === "GENERATION",
    );
    expect(root.usage_details?.total).toBe(17598);
    expect(models).toHaveLength(3);
    expect(
      models.reduce((sum, row) => sum + Number(row.usage_details?.input), 0),
    ).toBe(17107);
    expect(
      models.reduce((sum, row) => sum + Number(row.usage_details?.output), 0),
    ).toBe(491);
    expect(
      models.every(
        (row) =>
          row.agent_run_id === root.span_id && row.agent_id === root.agent_id,
      ),
    ).toBe(true);
  });

  it("represents revisions, tombstones and environment reclassification without re-keying events", () => {
    const { events } = buildAgentsMvpFixture(context, params);
    const rewrites = events.filter(
      (row) => row.span_id === `${context.idPrefix}-run-2-model-0`,
    );
    expect(rewrites).toHaveLength(2);
    expect(new Set(rewrites.map((row) => row.start_time)).size).toBe(1);
    expect(events.some((row) => row.is_deleted === 1)).toBe(true);
    const moved = events.filter(
      (row) => row.span_id === `${context.idPrefix}-run-4`,
    );
    expect(moved.map((row) => row.environment)).toEqual([
      "production",
      "staging",
    ]);
    expect(new Set(moved.map((row) => row.start_time)).size).toBe(1);
  });

  it("keeps unknown usage, unknown pricing and unknown owner references distinct from observed zero", () => {
    const { events } = buildAgentsMvpFixture(context, params);
    expect(
      events.some(
        (row) =>
          row.type === "GENERATION" &&
          Object.keys(row.usage_details ?? {}).length === 0 &&
          Object.keys(row.cost_details ?? {}).length === 0,
      ),
    ).toBe(true);
    expect(
      events.some(
        (row) => row.type === "GENERATION" && row.agent_id && !row.agent_run_id,
      ),
    ).toBe(true);
    const loaded = events.flatMap((row) => row.skills_resource_loaded ?? []);
    expect(new Set(loaded.map((skill) => skill.skillVersion))).toEqual(
      new Set([1, 2]),
    );
    expect(new Set(loaded.map((skill) => skill.filePath))).toEqual(
      new Set(["SKILL.md", "references/cases.md"]),
    );
  });

  it("includes older partitions for pruning checks without changing the selected four-hour window", () => {
    const fixture = buildAgentsMvpFixture(context, params);
    expect(fixture.end - fixture.start).toBe(4 * 3_600_000);
    expect(
      fixture.events.some(
        (row) =>
          Date.parse(row.start_time.replace(" ", "T") + "Z") <
          fixture.start - 30 * 86_400_000,
      ),
    ).toBe(true);
  });

  it("includes selected-period model activity whose explicit owning invocation starts before the period", () => {
    const fixture = buildAgentsMvpFixture(context, params);
    const root = fixture.events.find(
      (row) => row.span_id === `${context.idPrefix}-boundary-run`,
    )!;
    const leaf = fixture.events.find(
      (row) => row.span_id === `${context.idPrefix}-boundary-run-model`,
    )!;
    expect(Date.parse(root.start_time.replace(" ", "T") + "Z")).toBeLessThan(
      fixture.start,
    );
    expect(Date.parse(leaf.start_time.replace(" ", "T") + "Z")).toBeGreaterThan(
      fixture.start,
    );
    expect(leaf.agent_run_id).toBe(root.span_id);
  });

  it("rejects malformed time anchors, unsupported storage mode and unbounded fixture sizes", () => {
    expect(() =>
      buildAgentsMvpFixture(context, { ...params, date: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      buildAgentsMvpFixture(context, { ...params, runs: 100001 }),
    ).toThrow();
    expect(() =>
      buildAgentsMvpFixture(context, { ...params, v4: false }),
    ).toThrow();
  });
});
