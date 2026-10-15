import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_NAME_METADATA_KEY as AGENT,
  AGENT_PROJECTION_METADATA_KEYS as KEYS,
} from "../../features/agents/constants";

const mocks = vi.hoisted(() => ({
  createTrace: vi.fn((row: Record<string, unknown>) => row),
  createObservation: vi.fn((row: Record<string, unknown>) => row),
  createEvent: vi.fn((row: Record<string, unknown>) => row),
  createTracesCh: vi.fn(),
  createObservationsCh: vi.fn(),
  createEventsCh: vi.fn(),
  clickhouseClient: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
}));
vi.mock("../../server", () => mocks);
vi.mock("../../db", () => ({
  prisma: { traceSession: { upsert: mocks.upsert, count: mocks.count } },
}));

import {
  agentsRfcScenario,
  buildAgentsRfcFixture,
} from "../../../scripts/seeder/scenarios/agents-rfc";
import { seedRfcManagedSkills } from "../../../scripts/seeder/scenarios/agents-rfc-skills";

const context = {
  projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
  environment: "production",
  seed: 42,
  idPrefix: "agents-rfc-test",
  dryRun: true,
  baseUrl: "http://localhost:3017",
  log: () => {},
};
const params = {
  date: "2026-10-15",
  "end-hour": 15,
  hours: 4,
  days: 15,
  v4: true,
};
const ms = (value: unknown) =>
  typeof value === "number" ? value : Date.parse(String(value));

describe("agents RFC seed fixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has real sessions spanning multiple traces and repeated agent invocations", () => {
    const fixture = buildAgentsRfcFixture(
      {
        projectId: "synthetic-project",
        environment: "production",
        seed: 42,
        idPrefix: "agents-rfc-test",
        dryRun: true,
        baseUrl: "http://localhost:3017",
        log: () => {},
      },
      { date: "2026-10-15", "end-hour": 15, hours: 4, days: 15, v4: true },
    );
    expect(fixture.sessions.length).toBeGreaterThan(1);
    const traceCounts = new Map<string, number>();
    for (const trace of fixture.traces) {
      if (trace.session_id) {
        traceCounts.set(
          trace.session_id,
          (traceCounts.get(trace.session_id) ?? 0) + 1,
        );
      }
    }
    expect([...traceCounts.values()].some((count) => count > 1)).toBe(true);
    expect(
      fixture.observations.filter((row) => row.type === "AGENT").length,
    ).toBeGreaterThan(fixture.sessions.length);
  });

  it("provides enough settled baseline and recent sessions for four real comparisons", () => {
    const fixture = buildAgentsRfcFixture(context, params);
    for (const agent of ["agentique", "research", "verify", "compose"]) {
      const settled = fixture.observations.filter(
        (row) =>
          row.type === "AGENT" &&
          row.metadata?.[AGENT] === agent &&
          row.environment === "production" &&
          row.end_time != null &&
          ms(row.end_time) <= fixture.windowEnd - 5 * 60_000,
      );
      const sessionByTrace = new Map(
        fixture.traces.map((trace) => [trace.id, trace.session_id]),
      );
      const baseline = settled.filter(
        (row) =>
          ms(row.start_time) >= fixture.windowEnd - 14 * 86_400_000 &&
          ms(row.start_time) < fixture.windowEnd - 3_600_000,
      );
      const recent = settled.filter(
        (row) => ms(row.start_time) >= fixture.windowEnd - 3_600_000,
      );
      expect(
        new Set(baseline.map((row) => sessionByTrace.get(row.trace_id!))).size,
      ).toBeGreaterThanOrEqual(20);
      expect(
        new Set(recent.map((row) => sessionByTrace.get(row.trace_id!))).size,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps zero-execution sessions while retaining model tool requests separately", () => {
    const fixture = buildAgentsRfcFixture(context, params);
    const dropped = fixture.traces.filter((row) =>
      row.id.includes("-t-recent-5-"),
    );
    expect(dropped).toHaveLength(6);
    for (const trace of dropped) {
      const rows = fixture.observations.filter(
        (row) => row.trace_id === trace.id,
      );
      expect(trace.session_id).toBeTruthy();
      expect(rows.filter((row) => row.type === "TOOL")).toHaveLength(0);
      expect(
        rows.find((row) => row.type === "GENERATION")?.tool_call_names,
      ).toHaveLength(2);
    }
  });

  it("has the 500-vs-20, cost, runtime, dormant, sparse, open and sessionless shapes", () => {
    const fixture = buildAgentsRfcFixture(context, params);
    const baselineRows = fixture.observations.filter((row) =>
      row.trace_id?.endsWith("-t-baseline-0-1"),
    );
    const outlierRows = fixture.observations.filter((row) =>
      row.trace_id?.endsWith("-t-recent-0-5"),
    );
    expect(baselineRows).toHaveLength(20);
    expect(outlierRows).toHaveLength(500);
    const cost = fixture.observations.find(
      (row) =>
        row.trace_id?.endsWith("-t-recent-2-1") && row.type === "GENERATION",
    )!;
    expect(cost.usage_details?.input).toBe(1600);
    const slow = fixture.observations.find(
      (row) => row.trace_id?.endsWith("-t-recent-3-1") && row.type === "AGENT",
    )!;
    expect(ms(slow.end_time) - ms(slow.start_time)).toBe(15 * 60_000);
    const dormant = fixture.observations.filter(
      (row) => row.metadata?.[AGENT] === "intake",
    );
    expect(dormant.length).toBeGreaterThan(0);
    expect(
      dormant.every((row) => ms(row.start_time) < fixture.windowStart),
    ).toBe(true);
    expect(
      fixture.observations.some(
        (row) => row.type === "AGENT" && row.end_time === null,
      ),
    ).toBe(true);
    expect(fixture.traces.some((row) => row.session_id === null)).toBe(true);
    const orphanModel = fixture.observations.find(
      (row) =>
        row.trace_id?.endsWith("-t-sessionless") && row.type === "GENERATION",
    )!;
    expect(orphanModel.metadata).not.toHaveProperty(AGENT);
    expect(
      fixture.observations.some(
        (row) =>
          row.metadata?.["attributes.gen_ai.skill.name"] === "résumé-style",
      ),
    ).toBe(true);
  });

  it("declares capability/semantic facets and handoffs without inventing cross-trace parents", () => {
    const fixture = buildAgentsRfcFixture(context, params);
    const child = fixture.observations.find(
      (row) =>
        row.trace_id?.endsWith("-t-handoff-child") && row.type === "AGENT",
    )!;
    expect(child.metadata?.[KEYS.parentSessionId]).toBe(
      "agents-rfc-test-s-handoff-parent",
    );
    expect(child.metadata?.[KEYS.parentAgentName]).toBe("agentique");
    expect(child.parent_observation_id).toBeNull();
    expect(
      fixture.sessions.some(
        (row) => row.id === child.metadata?.[KEYS.parentSessionId],
      ),
    ).toBe(true);
    const research = fixture.observations.find(
      (row) => row.type === "AGENT" && row.metadata?.[AGENT] === "research",
    )!;
    const verify = fixture.observations.find(
      (row) => row.type === "AGENT" && row.metadata?.[AGENT] === "verify",
    )!;
    expect(
      JSON.parse(String(research.metadata?.[KEYS.availableTools])),
    ).toContain("web_search");
    expect(
      JSON.parse(String(verify.metadata?.[KEYS.availableTools])),
    ).toContain("web_search");
    expect(research.metadata?.[KEYS.area]).toBe("evidence");
    expect(research.metadata?.[KEYS.topic]).toBe("research");
    expect(research.metadata?.[KEYS.task]).toBeTruthy();
  });

  it("keeps ORDER BY identities stable and performs no writes in CLI dry-run", async () => {
    const first = buildAgentsRfcFixture(context, params);
    const second = buildAgentsRfcFixture(context, params);
    const tuples = (fixture: typeof first) =>
      fixture.observations.map((row) => [
        row.id,
        row.type,
        row.start_time,
        row.trace_id,
      ]);
    expect(tuples(second)).toEqual(tuples(first));
    const summary = await agentsRfcScenario.run(context, {
      ...params,
      "managed-skills": true,
    });
    expect(summary.counts.agents).toBe(8);
    expect(summary.counts.invocations).toBeGreaterThan(summary.counts.sessions);
    expect(summary.links[0]).toContain("dateRange=1792062000000-1792076400000");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.createTracesCh).not.toHaveBeenCalled();
    expect(mocks.createObservationsCh).not.toHaveBeenCalled();
    expect(mocks.createEventsCh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "2026-15-01", "2026-1-15"])(
    "rejects invalid anchor %s",
    (date) => {
      expect(() => buildAgentsRfcFixture(context, { ...params, date })).toThrow(
        "--date",
      );
    },
  );

  it("uses the managed Skills API once for each missing exact-name definition", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockImplementation(async (_url, init) => {
        if (init?.method !== "POST") return new Response("{}", { status: 404 });
        const content = JSON.parse(String(init.body)).files[0]
          .content as string;
        return Response.json(
          { name: content.match(/name: ([a-z-]+)/)![1], version: 1 },
          { status: 201 },
        );
      });
    expect(await seedRfcManagedSkills(context)).toBe(4);
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(4);
    expect(
      posts.every(([, init]) => String(init?.body).includes("SKILL.md")),
    ).toBe(true);
    fetchMock
      .mockClear()
      .mockImplementation(async (url) =>
        Response.json({ name: String(url).split("/").at(-1), version: 1 }),
      );
    expect(await seedRfcManagedSkills(context)).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method !== "POST"),
    ).toBe(true);
  });

  it("rejects a successful response that does not describe the requested skill", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ name: "other-skill", version: 1 }),
    );
    await expect(seedRfcManagedSkills(context)).rejects.toThrow(
      "unexpected skill",
    );
  });

  it("refuses to use the synthetic API key for a different project", async () => {
    await expect(
      seedRfcManagedSkills({ ...context, projectId: "other-project" }),
    ).rejects.toThrow("default seed project");
    expect(fetch).not.toHaveBeenCalled();
  });
});
