import { describe, expect, it } from "vitest";
import { findUiColumnMapping } from "../../tableDefinitions/types";
import { eventsTableUiColumnDefinitions } from "../../server/tableMappings/mapEventsTable";
import { tracesTableUiColumnDefinitions } from "../../server/tableMappings/mapTracesTable";
import { type EventsTableFilterState } from "../../types";
import {
  compileTraceDeletePredicate,
  TRACE_DELETE_PREDICATE_COLUMNS,
  traceDeleteCutoffFilter,
  type TraceDeleteCandidate,
  type TraceDeletePredicateSource,
} from "./traceDeletePredicate";

const CUTOFF = new Date("2026-01-10T12:00:00.000Z");
const BEFORE = new Date(CUTOFF.getTime() - 60_000);

const compile = (
  filter: unknown[],
  source: TraceDeletePredicateSource = "traces",
  extra: { searchQuery?: string } = {},
) =>
  compileTraceDeletePredicate({
    source,
    filter: filter as EventsTableFilterState,
    cutoffCreatedAt: CUTOFF,
    ...extra,
  });

const matcher = (
  filter: unknown[],
  source: TraceDeletePredicateSource = "traces",
) => {
  const compiled = compile(filter, source);
  if (!compiled.supported) throw new Error(compiled.reason);
  return compiled.matches;
};

const trace = (
  overrides: Record<string, unknown> = {},
): TraceDeleteCandidate => ({
  traceId: "t-1",
  id: "t-1",
  name: "chat",
  traceName: "chat",
  timestamp: BEFORE,
  userId: "user-1",
  sessionId: null,
  release: null,
  version: "v1",
  environment: "production",
  tags: ["a", "b"],
  traceTags: ["a", "b"],
  bookmarked: false,
  ...overrides,
});

const observation = (
  overrides: Record<string, unknown> = {},
): TraceDeleteCandidate => ({
  traceId: "t-1",
  id: "o-1",
  name: "llm-call",
  type: "GENERATION",
  startTime: BEFORE,
  environment: "production",
  traceEnvironment: "production",
  level: "DEFAULT",
  version: "",
  providedModelName: "gpt",
  promptName: "",
  parentObservationId: null,
  release: null,
  userId: "",
  sessionId: "",
  traceName: null,
  tags: [],
  traceTags: [],
  ...overrides,
});

const str = (column: string, operator: string, value: string) => ({
  column,
  type: "string",
  operator,
  value,
});

describe("compileTraceDeletePredicate", () => {
  describe("server column mappings", () => {
    const serverColumns = {
      traces: tracesTableUiColumnDefinitions,
      events: eventsTableUiColumnDefinitions,
    } as const;

    it.each(["traces", "events"] as const)(
      "resolves every %s column identifier to the same server column",
      (source) => {
        for (const column of TRACE_DELETE_PREDICATE_COLUMNS[source]) {
          for (const identifier of [
            column.uiTableId,
            column.uiTableName,
            ...(column.aliases ?? []),
          ]) {
            const server = findUiColumnMapping(
              serverColumns[source],
              identifier,
            );
            expect(server?.uiTableId, `${source} ${identifier}`).toBe(
              column.uiTableId,
            );
            expect(
              server?.emptyEqualsNull ?? false,
              `${source} ${identifier} emptyEqualsNull`,
            ).toBe(column.emptyEqualsNull ?? false);
          }
        }
      },
    );

    it("bounds each source on a column the server mapping knows", () => {
      for (const source of ["traces", "events"] as const) {
        const cutoff = traceDeleteCutoffFilter(source, CUTOFF);
        expect(
          findUiColumnMapping(serverColumns[source], cutoff.column),
        ).toBeDefined();
      }
    });
  });

  describe("cutoff", () => {
    it.each([
      ["traces", "timestamp"],
      ["events", "startTime"],
    ] as const)(
      "%s only matches rows strictly before the cutoff",
      (source, column) => {
        const matches = matcher([], source);
        const row = source === "traces" ? trace : observation;
        expect(matches(row({ [column]: BEFORE }))).toBe(true);
        expect(matches(row({ [column]: new Date(CUTOFF.getTime() - 1) }))).toBe(
          true,
        );
        expect(matches(row({ [column]: CUTOFF }))).toBe(false);
        expect(matches(row({ [column]: new Date(CUTOFF.getTime() + 1) }))).toBe(
          false,
        );
        expect(matches(row({ [column]: undefined }))).toBe(false);
      },
    );
  });

  describe("string operators", () => {
    it("is case-sensitive and treats NULL as no match", () => {
      const row = trace({ name: "Chat-Bot" });
      expect(matcher([str("name", "=", "Chat-Bot")])(row)).toBe(true);
      expect(matcher([str("name", "=", "chat-bot")])(row)).toBe(false);
      expect(matcher([str("Name", "contains", "t-B")])(row)).toBe(true);
      expect(matcher([str("name", "contains", "t-b")])(row)).toBe(false);
      expect(matcher([str("name", "does not contain", "x")])(row)).toBe(true);
      expect(matcher([str("name", "does not contain", "Bot")])(row)).toBe(
        false,
      );
      expect(matcher([str("name", "starts with", "Chat")])(row)).toBe(true);
      expect(matcher([str("name", "starts with", "Bot")])(row)).toBe(false);
      expect(matcher([str("name", "ends with", "Bot")])(row)).toBe(true);
      expect(matcher([str("name", "ends with", "Chat")])(row)).toBe(false);
      expect(matcher([str("name", "is not empty", "")])(row)).toBe(true);
      expect(
        matcher([str("name", "is not empty", "")])(trace({ name: "" })),
      ).toBe(false);

      const nullUser = trace({ userId: null });
      for (const operator of [
        "=",
        "contains",
        "does not contain",
        "starts with",
        "ends with",
        "is not empty",
      ]) {
        expect(matcher([str("userId", operator, "")])(nullUser), operator).toBe(
          false,
        );
      }
    });

    it("reads a null API value of a non-nullable column as ''", () => {
      const matches = matcher([str("version", "=", "")], "events");
      expect(matches(observation({ version: null }))).toBe(true);
      expect(matches(observation({ version: "" }))).toBe(true);
      expect(
        matcher(
          [str("version", "does not contain", "x")],
          "events",
        )(observation({ version: null })),
      ).toBe(true);
    });

    it("matches '' and NULL together for emptyEqualsNull columns", () => {
      const empty = matcher([str("release", "=", "")], "events");
      expect(empty(observation({ release: null }))).toBe(true);
      expect(empty(observation({ release: "" }))).toBe(true);
      expect(empty(observation({ release: "r1" }))).toBe(false);
      expect(
        matcher(
          [str("release", "starts with", "")],
          "events",
        )(observation({ release: null })),
      ).toBe(true);

      const notContains = matcher(
        [str("release", "does not contain", "x")],
        "events",
      );
      expect(notContains(observation({ release: "" }))).toBe(false);
      expect(notContains(observation({ release: "r1" }))).toBe(true);
    });

    it("treats an empty events trace name as NULL", () => {
      const matches = matcher([str("traceName", "=", "")], "events");
      expect(matches(observation({ traceName: "" }))).toBe(false);
      expect(
        matcher(
          [
            {
              column: "traceName",
              type: "null",
              operator: "is null",
              value: "",
            },
          ],
          "events",
        )(observation({ traceName: "" })),
      ).toBe(true);
    });

    it("rejects full-text match operators", () => {
      expect(compile([str("name", "matches", "x")]).supported).toBe(false);
    });
  });

  describe("string options", () => {
    const opt = (column: string, operator: string, value: string[]) => ({
      column,
      type: "stringOptions",
      operator,
      value,
    });

    it("applies any of / none of with NULL excluded", () => {
      expect(
        matcher([opt("environment", "any of", ["production"])])(trace()),
      ).toBe(true);
      expect(matcher([opt("environment", "any of", ["dev"])])(trace())).toBe(
        false,
      );
      expect(matcher([opt("environment", "none of", ["dev"])])(trace())).toBe(
        true,
      );
      expect(
        matcher([opt("environment", "none of", ["production"])])(trace()),
      ).toBe(false);
      expect(
        matcher([opt("userId", "none of", ["x"])])(trace({ userId: null })),
      ).toBe(false);
    });

    it("guards empty values for emptyEqualsNull columns", () => {
      const anyEmpty = matcher(
        [opt("parentObservationId", "any of", [""])],
        "events",
      );
      expect(anyEmpty(observation({ parentObservationId: null }))).toBe(true);
      expect(anyEmpty(observation({ parentObservationId: "p" }))).toBe(false);

      const noneOf = matcher(
        [opt("parentObservationId", "none of", ["p"])],
        "events",
      );
      expect(noneOf(observation({ parentObservationId: "q" }))).toBe(true);
      expect(noneOf(observation({ parentObservationId: "" }))).toBe(false);
      expect(noneOf(observation({ parentObservationId: null }))).toBe(false);

      const noneOfEmpty = matcher(
        [opt("parentObservationId", "none of", [""])],
        "events",
      );
      expect(noneOfEmpty(observation({ parentObservationId: "q" }))).toBe(true);
      expect(noneOfEmpty(observation({ parentObservationId: null }))).toBe(
        false,
      );
    });
  });

  describe("null operators", () => {
    const nul = (column: string, operator: string) => ({
      column,
      type: "null",
      operator,
      value: "",
    });

    it("checks SQL NULL, and '' too for emptyEqualsNull columns", () => {
      expect(matcher([nul("sessionId", "is null")])(trace())).toBe(true);
      expect(matcher([nul("sessionId", "is not null")])(trace())).toBe(false);
      expect(
        matcher([nul("sessionId", "is null")])(trace({ sessionId: "" })),
      ).toBe(false);
      expect(
        matcher(
          [nul("release", "is null")],
          "events",
        )(observation({ release: "" })),
      ).toBe(true);
      expect(
        matcher(
          [nul("release", "is not null")],
          "events",
        )(observation({ release: "r1" })),
      ).toBe(true);
    });
  });

  describe("datetime operators", () => {
    const at = new Date("2026-01-05T00:00:00.000Z");
    const dt = (operator: string, value: Date | string) => ({
      column: "timestamp",
      type: "datetime",
      operator,
      value,
    });

    it.each([
      [">", [false, false, true]],
      [">=", [false, true, true]],
      ["<", [true, false, false]],
      ["<=", [true, true, false]],
    ] as const)("applies %s", (operator, expected) => {
      const matches = matcher([dt(operator, at)]);
      const results = [-1, 0, 1].map((offset) =>
        matches(trace({ timestamp: new Date(at.getTime() + offset) })),
      );
      expect(results).toEqual(expected);
    });

    it("accepts the ISO string form a stored filter carries", () => {
      expect(
        matcher([dt(">=", at.toISOString())])(trace({ timestamp: at })),
      ).toBe(true);
    });
  });

  describe("array options", () => {
    const arr = (operator: string, value: string[]) => ({
      column: "tags",
      type: "arrayOptions",
      operator,
      value,
    });

    it("applies any of / none of / all of", () => {
      const row = trace({ tags: ["a", "b"] });
      expect(matcher([arr("any of", ["b", "z"])])(row)).toBe(true);
      expect(matcher([arr("any of", ["z"])])(row)).toBe(false);
      expect(matcher([arr("none of", ["z"])])(row)).toBe(true);
      expect(matcher([arr("none of", ["a"])])(row)).toBe(false);
      expect(matcher([arr("all of", ["a", "b"])])(row)).toBe(true);
      expect(matcher([arr("all of", ["a", "z"])])(row)).toBe(false);
      expect(matcher([arr("all of", [])])(row)).toBe(true);
      expect(matcher([arr("none of", [])])(row)).toBe(true);
    });
  });

  describe("boolean", () => {
    it("applies = and <>", () => {
      const bool = (operator: string, value: boolean) => ({
        column: "bookmarked",
        type: "boolean",
        operator,
        value,
      });
      expect(matcher([bool("=", true)])(trace({ bookmarked: true }))).toBe(
        true,
      );
      expect(matcher([bool("=", true)])(trace())).toBe(false);
      expect(matcher([bool("<>", true)])(trace())).toBe(true);
      expect(
        matcher([bool("=", false)])(trace({ bookmarked: undefined })),
      ).toBe(false);
    });
  });

  it("requires every condition to hold", () => {
    const matches = matcher([
      str("environment", "=", "production"),
      str("name", "=", "chat"),
    ]);
    expect(matches(trace())).toBe(true);
    expect(matches(trace({ name: "other" }))).toBe(false);
  });

  it("does not match a row that did not load a filtered column", () => {
    const matches = matcher([str("userId", "=", "u")], "events");
    const { userId: _userId, ...withoutUser } = observation({ userId: "u" });
    expect(matches(observation({ userId: "u" }))).toBe(true);
    expect(matches(withoutUser as TraceDeleteCandidate)).toBe(false);
  });

  describe("unsupported predicates", () => {
    it.each([
      ["free-text search", [], { searchQuery: "hello" }],
      [
        "metadata",
        [
          {
            column: "metadata",
            type: "stringObject",
            key: "k",
            operator: "=",
            value: "v",
          },
        ],
        {},
      ],
      [
        "scores",
        [
          {
            column: "Scores (numeric)",
            type: "numberObject",
            key: "quality",
            operator: ">",
            value: 0.5,
          },
        ],
        {},
      ],
      [
        "aggregates",
        [{ column: "latency", type: "number", operator: ">", value: 1 }],
        {},
      ],
      [
        "position in trace",
        [
          {
            column: "positionInTrace",
            type: "positionInTrace",
            operator: "=",
            key: "root",
          },
        ],
        {},
      ],
      [
        "an operator the column type does not take",
        [{ column: "tags", type: "string", operator: "=", value: "a" }],
        {},
      ],
    ] as const)("skips %s", (_label, filter, extra) => {
      const compiled = compile([...filter], "events", extra);
      expect(compiled.supported).toBe(false);
    });
  });

  describe("10,000 synthetic traces", () => {
    const TRACE_COUNT = 10_000;
    const ENVIRONMENTS = ["production", "staging", "dev"];
    const NAMES = ["chat-bot", "Chat-bot", "summarize", "rag-search"];

    // Deterministic pseudo-random so failures are reproducible.
    let seed = 42;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(values: readonly T[]) =>
      values[Math.floor(next() * values.length)]!;

    const traces = Array.from({ length: TRACE_COUNT }, (_, i) =>
      trace({
        traceId: `t-${i}`,
        id: `t-${i}`,
        name: pick(NAMES),
        environment: pick(ENVIRONMENTS),
        userId: next() < 0.2 ? null : `user-${Math.floor(next() * 50)}`,
        tags: next() < 0.5 ? ["beta"] : ["ga", "eu"],
        timestamp: new Date(CUTOFF.getTime() + (next() - 0.8) * 86_400_000),
      }),
    );
    const observations = traces.flatMap((row, i) =>
      Array.from({ length: 1 + (i % 3) }, (_, j) =>
        observation({
          traceId: row.traceId,
          id: `o-${i}-${j}`,
          type: pick(["SPAN", "GENERATION", "EVENT"]),
          level: pick(["DEFAULT", "ERROR"]),
          startTime: new Date(
            (row.timestamp as Date).getTime() + j * 3_600_000,
          ),
        }),
      ),
    );

    it("hides exactly the traces the batch action would delete (traces source)", () => {
      const matches = matcher([
        str("name", "starts with", "chat"),
        {
          column: "environment",
          type: "stringOptions",
          operator: "none of",
          value: ["dev"],
        },
        {
          column: "tags",
          type: "arrayOptions",
          operator: "any of",
          value: ["beta"],
        },
        str("userId", "is not empty", ""),
      ]);
      const expected = traces
        .filter(
          (row) =>
            (row.name as string).startsWith("chat") &&
            row.environment !== "dev" &&
            (row.tags as string[]).includes("beta") &&
            typeof row.userId === "string" &&
            row.userId !== "" &&
            (row.timestamp as Date) < CUTOFF,
        )
        .map((row) => row.traceId);

      const started = performance.now();
      const actual = traces.filter(matches).map((row) => row.traceId);
      const elapsed = performance.now() - started;

      expect(expected.length).toBeGreaterThan(100);
      expect(actual).toEqual(expected);
      expect(elapsed).toBeLessThan(250);
    });

    it("hides a trace when any observation matches (events source)", () => {
      const matches = matcher(
        [
          str("level", "=", "ERROR"),
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
        "events",
      );
      const expected = new Set(
        observations
          .filter(
            (row) =>
              row.level === "ERROR" &&
              row.type === "GENERATION" &&
              (row.startTime as Date) < CUTOFF,
          )
          .map((row) => row.traceId),
      );

      const started = performance.now();
      const actual = new Set(
        observations.filter(matches).map((row) => row.traceId),
      );
      const elapsed = performance.now() - started;

      expect(expected.size).toBeGreaterThan(100);
      expect([...actual].sort()).toEqual([...expected].sort());
      expect(elapsed).toBeLessThan(250);
    });
  });
});
