import { describe, expect, it } from "vitest";
import {
  formatLocalIsoDate,
  prepareLocalIsoDate,
} from "@/src/components/LocalIsoDate";

describe("formatLocalIsoDate", () => {
  const date = new Date("2026-08-21T09:07:05.004Z");

  it("formats each supported UTC accuracy", () => {
    expect(formatLocalIsoDate(date, true, "day")).toBe("2026-08-21");
    expect(formatLocalIsoDate(date, true, "hour")).toBe("2026-08-21 09");
    expect(formatLocalIsoDate(date, true, "minute")).toBe("2026-08-21 09:07");
    expect(formatLocalIsoDate(date, true, "second")).toBe(
      "2026-08-21 09:07:05",
    );
    expect(formatLocalIsoDate(date, true, "millisecond")).toBe(
      "2026-08-21 09:07:05.004",
    );
  });
});

describe("prepareLocalIsoDate", () => {
  it("defaults display accuracy to seconds and provides a millisecond UTC title", () => {
    const date = new Date("2026-08-21T09:07:05.004Z");
    const prepared = prepareLocalIsoDate({ date });

    expect(prepared?.display).toBe(formatLocalIsoDate(date, false, "second"));
    expect(prepared?.title).toBe("UTC: 2026-08-21 09:07:05.004");
  });

  it("uses the requested display accuracy", () => {
    const date = new Date("2026-08-21T09:07:05.004Z");

    expect(prepareLocalIsoDate({ date, accuracy: "day" })?.display).toBe(
      formatLocalIsoDate(date, false, "day"),
    );
  });

  it("rejects invalid dates", () => {
    expect(prepareLocalIsoDate({ date: new Date("invalid") })).toBeNull();
    expect(prepareLocalIsoDate({ date: "2026-08-21" })).toBeNull();
  });
});
