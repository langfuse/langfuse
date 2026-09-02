import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDashboardModified } from "./formatDashboardModified";

describe("formatDashboardModified", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows relative updated time and an absolute created date", () => {
    expect(
      formatDashboardModified(
        new Date("2026-08-27T12:00:00.000Z"),
        new Date("2024-10-01T00:00:00.000Z"),
      ),
    ).toEqual({
      updatedRelative: "6 days ago",
      createdAbsolute: "Created Oct 1, 2024",
    });
  });
});
