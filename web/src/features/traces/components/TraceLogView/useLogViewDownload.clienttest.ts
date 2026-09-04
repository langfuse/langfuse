import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLogViewDownload } from "./useLogViewDownload";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

// jsdom implements neither URL.createObjectURL nor Blob#text.
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn();
let lastBlob: Blob | undefined;

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

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
      traceId: "trace-1",
      isCacheOnly: false,
      allObservationsData: observations,
      isLoadingAllData: false,
      failedObservationIds: [],
      loadAllData: async () => observations,
      buildDataFromCache: () => observations,
    }),
  );
}

// jsdom ships no URL.createObjectURL, so capture whatever is (not) there and
// restore it — Object.assign alone would leak the stub past this file if the
// client project ever ran with a shared context.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("useLogViewDownload", () => {
  beforeEach(() => {
    lastBlob = undefined;
    copyTextToClipboard.mockClear();
    createObjectURL.mockImplementation((blob: Blob) => {
      lastBlob = blob;
      return "blob:mock";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.assign(URL, {
      createObjectURL: originalCreateObjectURL,
      revokeObjectURL: originalRevokeObjectURL,
    });
    vi.restoreAllMocks();
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

  it("decodes \\uXXXX escapes in the downloaded JSON", async () => {
    const { result } = renderDownloadHook();

    await act(async () => {
      await result.current.handleDownloadJson();
    });

    expect(lastBlob).toBeDefined();
    const content = await readBlobAsText(lastBlob!);
    expect(content).toContain("こんにちは");
    expect(content).toContain("ありがとう");
    expect(content).not.toContain("\\u3053");
  });
});
