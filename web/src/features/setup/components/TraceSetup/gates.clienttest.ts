// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readingOf } from "./firstTrace";
import { isSetUp, nextGateOf, openGatesOf, type OpenGate } from "./gates";
import type { FirstTrace, FirstTraceNode, Scoring } from "./types";

const at = (ms: number) => new Date(Date.UTC(2026, 9, 23, 9, 0, 0, ms));

const generation: FirstTraceNode = {
  id: "gen",
  type: "GENERATION",
  name: "openai.chat",
  startTime: at(0),
  endTime: at(10),
  model: "gpt-4o-mini",
  children: [],
};

const trace = (overrides: Partial<FirstTrace> = {}): FirstTrace => ({
  id: "t",
  name: "chat",
  href: "#",
  source: { kind: "app" },
  totalTokens: 10,
  costUsd: 0.001,
  io: { input: "hi", output: "hello" },
  roots: [
    {
      id: "root",
      type: "SPAN",
      name: "chat",
      startTime: at(0),
      endTime: at(10),
      children: [generation],
    },
  ],
  ...overrides,
});

const noModel = { status: "noModel" } satisfies Scoring;
const scored: Scoring = {
  status: "scored",
  score: { name: "Helpfulness", value: 0.9, reason: "Answers the question." },
  evaluatorHref: "#",
};

const openFor = (
  traceOverrides: Partial<FirstTrace>,
  scoring: Scoring,
  hasTeammates = false,
) =>
  openGatesOf({
    reading: readingOf(trace(traceOverrides)),
    scoring,
    hasTeammates,
  });

const keepsWorking: OpenGate = { gate: "keepsWorking", scoring: noModel };
const shared: OpenGate = { gate: "shared" };

describe("openGatesOf", () => {
  it("leaves scoring and the team open for a healthy trace that isn't scored yet", () => {
    expect(openFor({}, noModel)).toEqual([keepsWorking, shared]);
  });

  it("holds the broken gate open on the failed step, the wrapper's too", () => {
    const wrapper = trace().roots[0];
    if (!wrapper) throw new Error("The fixture has a wrapper");
    const failed = { ...wrapper, level: "ERROR" as const };
    expect(openFor({ roots: [failed] }, noModel)[0]).toEqual({
      gate: "nothingBroken",
      failed,
    });
  });

  it("holds the usable gate open on its tip while the trace has no input and output", () => {
    expect(openFor({ io: null }, noModel)[0]).toMatchObject({
      gate: "usableData",
      tip: { action: "What to send" },
    });
  });

  it("leaves nothing open once it's scored and a teammate joined", () => {
    expect(openFor({}, scored, true)).toEqual([]);
  });
});

describe("nextGateOf", () => {
  it("is the first open gate", () => {
    expect(nextGateOf([keepsWorking, shared], [])).toBe(keepsWorking);
  });

  it("goes past a skipped gate without passing it", () => {
    expect(nextGateOf([keepsWorking, shared], ["keepsWorking"])).toBe(shared);
  });

  it("is null when every open gate is skipped", () => {
    expect(
      nextGateOf([keepsWorking, shared], ["keepsWorking", "shared"]),
    ).toBeNull();
  });
});

describe("isSetUp", () => {
  it("doesn't need the team", () => {
    expect(isSetUp([shared])).toBe(true);
  });

  it("isn't set up while a gate before the team is open", () => {
    expect(isSetUp([keepsWorking, shared])).toBe(false);
  });
});
