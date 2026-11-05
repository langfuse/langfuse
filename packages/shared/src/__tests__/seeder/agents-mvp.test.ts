import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../server/test-utils/clickhouse-helpers", () => ({
  createEventsCh: vi.fn(),
}));
vi.mock("../../../scripts/seeder/scenarios/verify", async (original) => ({
  ...(await original<
    typeof import("../../../scripts/seeder/scenarios/verify")
  >()),
  countRows: vi.fn(),
}));
vi.mock(
  "../../../scripts/seeder/scenarios/agents-mvp-skills",
  async (original) => ({
    ...(await original<
      typeof import("../../../scripts/seeder/scenarios/agents-mvp-skills")
    >()),
    seedAgentsMvpSkills: vi.fn(),
  }),
);
vi.mock("../../../scripts/seeder/scenarios/agents-mvp-legacy-api", () => ({
  seedAgentsMvpLegacyApi: vi.fn(),
}));
import {
  agentsMvpScenario,
  buildAgentsMvpFixture,
} from "../../../scripts/seeder/scenarios/agents-mvp";
import { countRows } from "../../../scripts/seeder/scenarios/verify";
import { createEventsCh } from "../../server/test-utils/clickhouse-helpers";
import {
  agentsMvpManagedSkillName,
  AGENTS_MVP_UNRESOLVED_SKILL,
  seedAgentsMvpSkills,
} from "../../../scripts/seeder/scenarios/agents-mvp-skills";
import { seedAgentsMvpLegacyApi } from "../../../scripts/seeder/scenarios/agents-mvp-legacy-api";

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(seedAgentsMvpSkills).mockResolvedValue(
      [1, 2].map((version) => ({
        id: `managed-v${version}`,
        name: agentsMvpManagedSkillName(context.idPrefix),
        version,
      })),
    );
  });
  it("writes exact managed skill version references and retains an unresolved resource", async () => {
    vi.mocked(countRows).mockResolvedValueOnce(81);
    await agentsMvpScenario.run({ ...context, dryRun: false }, params);
    const written = vi
      .mocked(createEventsCh)
      .mock.calls.flatMap(([rows]) => rows);
    const loaded = written.flatMap((row) => row.skills_resource_loaded ?? []);
    const managed = loaded.filter(
      (skill) =>
        skill.skillName === agentsMvpManagedSkillName(context.idPrefix),
    );
    expect(managed.length).toBeGreaterThan(0);
    expect(
      managed.every(
        (skill) => skill.langfuseSkillId === `managed-v${skill.skillVersion}`,
      ),
    ).toBe(true);
    expect(new Set(managed.map((skill) => skill.skillVersion))).toEqual(
      new Set([1, 2]),
    );
    expect(
      loaded.some(
        (skill) =>
          skill.skillName === AGENTS_MVP_UNRESOLVED_SKILL &&
          !skill.langfuseSkillId &&
          !skill.skillVersion,
      ),
    ).toBe(true);
    const available = written.flatMap((row) => row.skills_available ?? []);
    expect(available.length).toBeGreaterThan(0);
    expect(
      available.every(
        (skill) => skill.langfuseSkillId === `managed-v${skill.skillVersion}`,
      ),
    ).toBe(true);
  });
  it("includes every generated trace namespace in the post-write readback", async () => {
    const fixture = buildAgentsMvpFixture(context, params);
    vi.mocked(countRows).mockResolvedValueOnce(fixture.runs);
    const result = await agentsMvpScenario.run(
      { ...context, dryRun: false },
      params,
    );
    const queryParams = vi.mocked(countRows).mock.calls.at(-1)![2];
    expect(vi.mocked(countRows).mock.calls.at(-1)![1]).not.toContain(
      "legacyTrace",
    );
    expect(queryParams).not.toHaveProperty("legacyTrace");
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
    expect(
      new Set(loaded.flatMap((skill) => skill.skillVersion ?? [])),
    ).toEqual(new Set([1, 2]));
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
  it("does not contact the Skills API or write telemetry during a dry run", async () => {
    const summary = await agentsMvpScenario.run(context, {
      ...params,
      "legacy-api": true,
    });
    expect(summary.counts).toEqual({ agents: 8, runs: 81, events: 491 });
    expect(seedAgentsMvpSkills).not.toHaveBeenCalled();
    expect(createEventsCh).not.toHaveBeenCalled();
    expect(seedAgentsMvpLegacyApi).not.toHaveBeenCalled();
  });
  it("excludes already propagated legacy invocations from primary fixture readback on rerun", async () => {
    vi.mocked(countRows).mockImplementationOnce(
      async (_table, where, queryParams) =>
        where.includes("trace_id != {legacyTrace:String}") &&
        queryParams.legacyTrace === `${context.idPrefix}-legacy-api-trace`
          ? 81
          : 83,
    );
    vi.mocked(seedAgentsMvpLegacyApi).mockResolvedValueOnce({
      traceIds: ["legacy-trace"],
      links: ["legacy-link"],
      verified: { Runs: 2 },
    });
    const summary = await agentsMvpScenario.run(
      { ...context, dryRun: false },
      { ...params, "legacy-api": true },
    );
    expect(seedAgentsMvpLegacyApi).toHaveBeenCalledWith(
      { ...context, dryRun: false },
      params.date,
    );
    expect(summary.counts).toEqual({ agents: 8, runs: 81, events: 491 });
    expect(summary.verified.legacyApiRuns).toBe(2);
    expect(summary.traceIds).toContain("legacy-trace");
    expect(summary.links).toContain("legacy-link");
  });
});
