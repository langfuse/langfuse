import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLogViewDownload } from "./useLogViewDownload";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

// Escaped Japanese as ingested via the Python SDK's ensure_ascii=True.
const observations: ObservationIOData[] = [
  {
    id: "obs-1",
    type: "GENERATION",
    name: "generation",
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    depth: 0,
    input: '{"question":"\\u3053\\u3093\\u306b\\u3061\\u306f"}',
    output: "\\u3042\\u308a\\u304c\\u3068\\u3046",
  },
];

function renderDownloadHook() {
  return renderHook(() =>
    useLogViewDownload({
      isCacheOnly: false,
      allObservationsData: observations,
      isLoadingAllData: false,
      failedObservationIds: [],
      loadAllData: async () => observations,
      buildDataFromCache: () => observations,
    }),
  );
}

describe("useLogViewDownload", () => {
  beforeEach(() => {
    copyTextToClipboard.mockClear();
  });

  it("decodes \\uXXXX escapes in the copied JSON", async () => {
    const { result } = renderDownloadHook();

    await act(async () => {
      await result.current.handleCopyJson();
    });

    expect(copyTextToClipboard).toHaveBeenCalledTimes(1);
    const copied = copyTextToClipboard.mock.calls[0][0] as string;
    expect(copied).toContain("こんにちは");
    expect(copied).toContain("ありがとう");
    expect(copied).not.toContain("\\u3053");
  });
});
