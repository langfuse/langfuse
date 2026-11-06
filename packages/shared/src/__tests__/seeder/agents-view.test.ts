import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_NAME_METADATA_KEY,
  SKILL_TOOL_NAMES,
} from "../../features/agents/constants";
import { type ScenarioContext } from "../../../scripts/seeder/scenarios/types";

type TraceInput = Parameters<typeof import("../../server").createTrace>[0];
type ObservationInput = Parameters<
  typeof import("../../server").createObservation
>[0];
type EventInput = Parameters<typeof import("../../server").createEvent>[0];

const mocks = vi.hoisted(() => ({
  createTrace: vi.fn((row: TraceInput) => row),
  createObservation: vi.fn((row: ObservationInput) => row),
  createEvent: vi.fn((row: EventInput) => row),
  createTracesCh: vi.fn(),
  createObservationsCh: vi.fn(),
  createEventsCh: vi.fn(),
  clickhouseClient: vi.fn(),
}));

vi.mock("../../server", () => mocks);

import { agentsViewScenario } from "../../../scripts/seeder/scenarios/agents-view";

const context: ScenarioContext = {
  projectId: "synthetic-project",
  environment: "production",
  seed: 42,
  idPrefix: "agents-view-s42",
  dryRun: true,
  baseUrl: "http://localhost:3017",
  log: vi.fn(),
};
const params = Object.fromEntries(
  agentsViewScenario.flags.map((flag) => [flag.flag, flag.default]),
);
const observations = () =>
  mocks.createObservation.mock.calls.map(([row]) => row);
const skillToolPattern = new RegExp(
  `(^|[^a-z0-9_])(${SKILL_TOOL_NAMES.join("|")})($|[^a-z0-9_])`,
  "i",
);

describe("agents-view seed scenario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("gives every named agent a valid skill call and mirrors its identity into v4", async () => {
    const summary = await agentsViewScenario.run(context, {
      ...params,
      date: "2026-10-08",
    });
    const rows = observations();
    const agentNames = new Set(
      rows.flatMap((row) => row.metadata?.[AGENT_NAME_METADATA_KEY] ?? []),
    );
    const skillCalls = rows.filter(
      (row) => row.type === "TOOL" && skillToolPattern.test(row.name ?? ""),
    );
    expect(
      new Set(skillCalls.map((row) => row.metadata?.[AGENT_NAME_METADATA_KEY])),
    ).toEqual(agentNames);
    expect(agentNames.size).toBe(8);
    expect(skillCalls).toHaveLength(267);
    for (const skill of skillCalls) {
      const input = JSON.parse(String(skill.input));
      expect(input.name ?? input.skillName).toEqual(expect.any(String));
      const event = mocks.createEvent.mock.calls
        .map(([row]) => row)
        .find((row) => row.span_id === skill.id)!;
      expect(
        event.metadata_values?.[
          event.metadata_names?.indexOf(AGENT_NAME_METADATA_KEY) ?? -1
        ],
      ).toBe(skill.metadata?.[AGENT_NAME_METADATA_KEY]);
    }
    expect(summary.counts).toMatchObject({
      traces: 22,
      runs: 140,
      agents: 8,
      observations: 562,
      events: 584,
      skillCalls: 267,
      agentsWithSkills: 8,
    });
    expect(mocks.createTracesCh).not.toHaveBeenCalled();
    expect(mocks.createObservationsCh).not.toHaveBeenCalled();
    expect(mocks.createEventsCh).not.toHaveBeenCalled();
  });

  it("keeps a pinned day's row keys and generation costs identical across later days", async () => {
    vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
    await agentsViewScenario.run(context, { ...params, date: "" });
    const originalRows = observations().map((row) => ({
      id: row.id,
      type: row.type,
      parent: row.parent_observation_id,
      start: row.start_time,
      end: row.end_time,
      usage: row.usage_details,
      cost: row.cost_details,
    }));
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
    const summary = await agentsViewScenario.run(context, {
      ...params,
      date: "2026-10-08",
    });
    expect(
      observations().map((row) => ({
        id: row.id,
        type: row.type,
        parent: row.parent_observation_id,
        start: row.start_time,
        end: row.end_time,
        usage: row.usage_details,
        cost: row.cost_details,
      })),
    ).toEqual(originalRows);
    expect(observations()[0].start_time).toBe(1791446400000);
    const partialGeneration = observations().find(
      (row) => row.id === "agents-view-s42-trace-20-llm",
    )!;
    expect(partialGeneration.metadata).not.toHaveProperty(
      AGENT_NAME_METADATA_KEY,
    );
    expect(partialGeneration.usage_details).toEqual({
      input: 160,
      output: 50,
      total: 210,
    });
    for (const link of summary.links.filter((link) =>
      new URL(link).pathname.startsWith(`/project/${context.projectId}/agents`),
    )) {
      expect(new URL(link).searchParams.get("dateRange")).toBe(
        "1791446400000-1791460800000",
      );
    }
    expect(
      summary.links.some(
        (link) => new URL(link).searchParams.get("tab") === "skills",
      ),
    ).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-00-08",
    "2026-13-01",
    "2026-1-08",
    "2026-10-08T00:00:00Z",
  ])(
    "rejects an invalid or non-calendar date %s before planning rows",
    async (date) => {
      await expect(
        agentsViewScenario.run(context, { ...params, date }),
      ).rejects.toThrow("--date must be a valid UTC date in YYYY-MM-DD format");
      expect(mocks.createTrace).not.toHaveBeenCalled();
      expect(mocks.createObservation).not.toHaveBeenCalled();
    },
  );

  it("accepts a real leap day as UTC midnight", async () => {
    await agentsViewScenario.run(context, { ...params, date: "2024-02-29" });
    expect(observations()[0].start_time).toBe(
      Date.parse("2024-02-29T08:00:00.000Z"),
    );
  });
});
