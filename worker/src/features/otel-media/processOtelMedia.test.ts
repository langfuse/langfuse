import { describe, expect, it, vi } from "vitest";

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: vi.fn() },
  processOtelMedia: vi.fn(),
  uploadMediaForTrace: vi.fn(),
}));

import { processOtelMediaIfEnabled } from "./processOtelMedia";

describe("processOtelMediaIfEnabled", () => {
  it("does not invoke media processing when disabled", async () => {
    const processMedia = vi.fn();

    await processOtelMediaIfEnabled({
      enabled: false,
      resourceSpans: [],
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).not.toHaveBeenCalled();
  });

  it("invokes media processing when enabled", async () => {
    const processMedia = vi.fn().mockResolvedValue(undefined);

    await processOtelMediaIfEnabled({
      enabled: true,
      resourceSpans: [],
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).toHaveBeenCalledTimes(1);
  });

  it("fails open when media processing throws", async () => {
    const processMedia = vi.fn().mockRejectedValue(new Error("unexpected"));

    await expect(
      processOtelMediaIfEnabled({
        enabled: true,
        resourceSpans: [],
        projectId: "project-id",
        fileKey: "file-key",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
        processMedia,
      }),
    ).resolves.toBeUndefined();
  });
});
