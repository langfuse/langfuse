import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryClickhouse } = vi.hoisted(() => ({ queryClickhouse: vi.fn() }));
vi.mock("../../../server/repositories/clickhouse", () => ({ queryClickhouse }));

import {
  outdatedSdkVersionsRule,
  isOutdatedSdkVersion,
} from "./outdatedSdkVersions";

describe("outdated SDK versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-30T12:00:00Z"));
    queryClickhouse.mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("warns at a major or twenty minor versions behind, not for smaller gaps or bad versions", () => {
    expect(isOutdatedSdkVersion("3.99.0", "4.1.0")).toBe(true);
    expect(isOutdatedSdkVersion("4.10.0", "4.30.0")).toBe(true);
    expect(isOutdatedSdkVersion("4.11.0", "4.30.0")).toBe(false);
    expect(isOutdatedSdkVersion("4.30.0", "4.30.0")).toBe(false);
    expect(isOutdatedSdkVersion("5.0.0", "4.30.0")).toBe(false);
    expect(isOutdatedSdkVersion("unknown", "4.30.0")).toBe(false);
  });

  it("reports each outdated version used in the past week for each known SDK", async () => {
    queryClickhouse.mockResolvedValue([
      { sdk_name: "python", sdk_version: "3.10.0" },
      { sdk_name: "langfuse-python", sdk_version: "4.16.0" },
      { sdk_name: "langfuse-js", sdk_version: "4.0.0" },
      { sdk_name: "other", sdk_version: "1.0.0" },
      { sdk_name: "python", sdk_version: "unknown" },
    ]);

    const issues = await outdatedSdkVersionsRule.callback!("project-a");
    expect(issues).toHaveLength(2);
    expect(issues[0]?.description).toContain("Python");
    expect(issues[0]?.description).toContain("3.10.0");
    expect(issues[0]?.description).toContain("4.16.0");
    expect(issues[1]?.description).toContain("JavaScript");
    expect(issues[1]?.description).toContain("4.0.0");
    const request = queryClickhouse.mock.calls[0][0];
    expect(request.params).toMatchObject({
      projectId: "project-a",
      since: "2026-09-23 12:00:00.000",
    });
    expect(request.query).toContain("is_deleted = 0");
    expect(request.query).toContain("ingestion_sdk_name");
    expect(request.query).toContain("ingestion_sdk_version");
  });

  it("returns nothing without recognized outdated SDK usage", async () => {
    expect(await outdatedSdkVersionsRule.callback!("project-a")).toEqual([]);
  });
});
