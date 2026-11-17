import { describe, expect, it } from "vitest";
import {
  compilePendingTraceDeletionQuery,
  traceDeleteCandidateFromEventsRow,
  traceDeleteCandidateFromObservation,
  traceDeleteCandidateFromTrace,
} from "./pendingTraceDeletionMatch";
import { type PendingTraceDeletionQueryEntry } from "./pendingTraceDeletions";

const CUTOFF = new Date("2026-01-10T12:00:00.000Z");
const BEFORE = new Date(CUTOFF.getTime() - 1000);

// Stored entries are JSON: Date filter values come back as ISO strings.
const stored = (
  entry: Omit<PendingTraceDeletionQueryEntry, "cutoffCreatedAt" | "createdAt">,
): PendingTraceDeletionQueryEntry =>
  JSON.parse(
    JSON.stringify({
      ...entry,
      cutoffCreatedAt: CUTOFF.toISOString(),
      createdAt: CUTOFF.getTime(),
    }),
  );

describe("compilePendingTraceDeletionQuery", () => {
  it("compiles a stored events filter, including a JSON datetime bound", () => {
    const compiled = compilePendingTraceDeletionQuery(
      stored({
        source: "events",
        filter: [
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            column: "providedModelName",
            type: "string",
            operator: "=",
            value: "gpt",
          },
        ],
        searchType: ["id"],
      }),
    );
    if (!compiled.supported) throw new Error(compiled.reason);

    const row = traceDeleteCandidateFromEventsRow({
      id: "o-1",
      traceId: "t-1",
      startTime: BEFORE,
      model: "gpt",
    });
    expect(row && compiled.matches(row)).toBe(true);

    const late = traceDeleteCandidateFromEventsRow({
      id: "o-2",
      traceId: "t-2",
      startTime: CUTOFF,
      model: "gpt",
    });
    expect(late && compiled.matches(late)).toBe(false);
  });

  it("skips entries whose filter no longer parses or that carry a search", () => {
    expect(
      compilePendingTraceDeletionQuery(
        stored({ source: "traces", filter: [{ column: "name" }] }),
      ).supported,
    ).toBe(false);
    expect(
      compilePendingTraceDeletionQuery(
        stored({ source: "traces", filter: [], searchQuery: "hello" }),
      ).supported,
    ).toBe(false);
  });
});

describe("trace delete candidates", () => {
  it("keys a trace by traces-table column", () => {
    expect(
      traceDeleteCandidateFromTrace({
        id: "t-1",
        name: "chat",
        timestamp: BEFORE,
        tags: ["a"],
        environment: "production",
        bookmarked: true,
      }),
    ).toMatchObject({
      traceId: "t-1",
      id: "t-1",
      name: "chat",
      traceName: "chat",
      timestamp: BEFORE,
      userId: null,
      environment: "production",
      tags: ["a"],
      traceTags: ["a"],
      bookmarked: true,
    });
    expect(
      "bookmarked" in
        traceDeleteCandidateFromTrace({ id: "t", timestamp: BEFORE, tags: [] }),
    ).toBe(false);
  });

  it("leaves trace-level fields out of a trace-detail observation", () => {
    const candidate = traceDeleteCandidateFromObservation({
      id: "o-1",
      traceId: "t-1",
      startTime: BEFORE,
      providedModelName: "gpt",
    });
    expect(candidate).toMatchObject({
      traceId: "t-1",
      providedModelName: "gpt",
    });
    expect(candidate && "userId" in candidate).toBe(false);
    expect(
      traceDeleteCandidateFromObservation({ id: "o", startTime: BEFORE }),
    ).toBeNull();
  });

  it("adds the trace-level fields an events list row carries", () => {
    expect(
      traceDeleteCandidateFromEventsRow({
        id: "o-1",
        traceId: "t-1",
        startTime: BEFORE,
        userId: "u",
        traceName: "chat",
        traceTags: ["a"],
      }),
    ).toMatchObject({
      userId: "u",
      traceName: "chat",
      tags: ["a"],
      traceTags: ["a"],
    });
  });
});
