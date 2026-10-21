import { beforeEach, describe, expect, it, vi } from "vitest";

const reportNonTrpcError = vi.fn();

vi.mock("@/src/utils/api", () => ({
  reportNonTrpcError: (...args: unknown[]) => reportNonTrpcError(...args),
}));

import { downloadSessionAsJson } from "./downloadSessionAsJson";

const capture = vi.fn();

describe("downloadSessionAsJson", () => {
  beforeEach(() => {
    reportNonTrpcError.mockReset();
    capture.mockReset();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:session"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("swallows a rejected comment fetch so the download click is not unhandled", async () => {
    const error = Object.assign(new Error("UNAUTHORIZED"), {
      data: { code: "UNAUTHORIZED" },
    });

    await expect(
      downloadSessionAsJson({
        capture,
        fetchTraceComments: async () => {
          throw error;
        },
        projectId: "project-1",
        refetchSessionComments: async () => ({ data: [] }),
        session: undefined,
        sessionId: "session-1",
      }),
    ).resolves.toBeUndefined();

    expect(capture).not.toHaveBeenCalled();
    expect(reportNonTrpcError).toHaveBeenCalledWith(error, "sessions");
  });
});
