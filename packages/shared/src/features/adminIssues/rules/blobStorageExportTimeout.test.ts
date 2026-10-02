import { beforeEach, describe, expect, it, vi } from "vitest";

const { findIntegration } = vi.hoisted(() => ({ findIntegration: vi.fn() }));

vi.mock("../../../db", () => ({
  prisma: { blobStorageIntegration: { findUnique: findIntegration } },
}));

import { blobStorageExportTimeoutRule } from "./blobStorageExportTimeout";

const TIMEOUT_ERROR =
  "Code: 159. DB::Exception: Timeout exceeded: elapsed 3634811.236443 ms, maximum: 3605000 ms. (TIMEOUT_EXCEEDED) (version 26.4.1.2359 (official build)) [query_id: 34cc7084-a84a-41fb-b7af-f7da11538ca6]";

describe("blobStorageExportTimeoutRule", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["CSV", "JSON", "JSONL"])(
    "recommends Parquet when a %s export timed out",
    async (fileType) => {
      findIntegration.mockResolvedValue({ fileType, lastError: TIMEOUT_ERROR });

      expect(await blobStorageExportTimeoutRule.callback!("project-a")).toEqual(
        [
          {
            description: expect.stringContaining("to Parquet"),
            priority: 2,
            ctaLink: "/project/project-a/settings/integrations/blobstorage",
          },
        ],
      );
      expect(findIntegration).toHaveBeenCalledWith({
        where: { projectId: "project-a" },
        select: { fileType: true, lastError: true },
      });
    },
  );

  it.each([
    ["no integration", null],
    ["no last error", { fileType: "CSV", lastError: null }],
    ["a Parquet export", { fileType: "PARQUET", lastError: TIMEOUT_ERROR }],
    [
      "a non-timeout error",
      { fileType: "CSV", lastError: "The specified bucket does not exist" },
    ],
  ])("returns no issue for %s", async (_, integration) => {
    findIntegration.mockResolvedValue(integration);

    expect(await blobStorageExportTimeoutRule.callback!("project-a")).toEqual(
      [],
    );
  });
});
