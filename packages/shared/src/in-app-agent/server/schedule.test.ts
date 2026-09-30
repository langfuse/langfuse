import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { buildInAppAgentRoutineCron } from "../routines";
import {
  getNextInAppAgentRoutineRunAt,
  parseInAppAgentRoutineSchedule,
} from "./schedule";

describe("buildInAppAgentRoutineCron", () => {
  it("builds each preset", () => {
    expect(buildInAppAgentRoutineCron({ hour: 9, minute: 0 })).toBe(
      "0 9 * * *",
    );
    expect(buildInAppAgentRoutineCron({ minute: 0, everyHours: 6 })).toBe(
      "0 */6 * * *",
    );
    expect(buildInAppAgentRoutineCron({ minute: 0, hours: [9, 13, 18] })).toBe(
      "0 9,13,18 * * *",
    );
    expect(
      buildInAppAgentRoutineCron({ hour: 9, minute: 0, weekdays: true }),
    ).toBe("0 9 * * 1-5");
    expect(buildInAppAgentRoutineCron({ hour: 9, minute: 0, weekday: 1 })).toBe(
      "0 9 * * 1",
    );
    expect(
      buildInAppAgentRoutineCron({ hour: 9, minute: 0, dayOfMonth: 1 }),
    ).toBe("0 9 1 * *");
  });
});

describe("parseInAppAgentRoutineSchedule", () => {
  it("accepts a 5-field daily cron and timezone", () => {
    expect(
      parseInAppAgentRoutineSchedule({
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
      }),
    ).toEqual({ cron: "0 9 * * *", timezone: "Europe/Berlin" });
  });

  it("accepts an edited multi-hour cron", () => {
    expect(
      parseInAppAgentRoutineSchedule({
        cron: "0 9,13,18 * * *",
        timezone: "America/New_York",
      }).cron,
    ).toBe("0 9,13,18 * * *");
  });

  it("rejects a 6-field cron", () => {
    expect(() =>
      parseInAppAgentRoutineSchedule({
        cron: "0 0 9 * * *",
        timezone: "UTC",
      }),
    ).toThrow(InvalidRequestError);
  });

  it("rejects an unknown timezone", () => {
    expect(() =>
      parseInAppAgentRoutineSchedule({
        cron: "0 9 * * *",
        timezone: "Not/AZone",
      }),
    ).toThrow(InvalidRequestError);
  });

  it("rejects a sub-hour expression", () => {
    expect(() =>
      parseInAppAgentRoutineSchedule({
        cron: "*/15 * * * *",
        timezone: "UTC",
      }),
    ).toThrow(/hour/);
  });
});

describe("getNextInAppAgentRoutineRunAt", () => {
  it("advances daily, weekday, and weekly presets", () => {
    const afterFridayMorning = new Date("2026-03-27T08:00:01.000Z");

    expect(
      getNextInAppAgentRoutineRunAt({
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
        after: afterFridayMorning,
      }).toISOString(),
    ).toBe("2026-03-28T08:00:00.000Z");

    expect(
      getNextInAppAgentRoutineRunAt({
        cron: "0 9 * * 1-5",
        timezone: "Europe/Berlin",
        after: afterFridayMorning,
      }).toISOString(),
    ).toBe("2026-03-30T07:00:00.000Z");

    expect(
      getNextInAppAgentRoutineRunAt({
        cron: "0 9 * * 1",
        timezone: "Europe/Berlin",
        after: afterFridayMorning,
      }).toISOString(),
    ).toBe("2026-03-30T07:00:00.000Z");
  });

  it("keeps 09:00 local across the Berlin spring-forward", () => {
    const afterSaturdayMorning = new Date("2026-03-28T08:00:01.000Z");

    expect(
      getNextInAppAgentRoutineRunAt({
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
        after: afterSaturdayMorning,
      }).toISOString(),
    ).toBe("2026-03-29T07:00:00.000Z");
  });

  it("jumps a missed tick to the next future slot", () => {
    expect(
      getNextInAppAgentRoutineRunAt({
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
        after: new Date("2026-03-30T15:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-03-31T07:00:00.000Z");
  });
});
