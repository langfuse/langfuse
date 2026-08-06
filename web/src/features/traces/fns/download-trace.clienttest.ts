import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadLegacyTraceAsJson } from "./download-trace";

// jsdom does not implement URL.createObjectURL, so we install our own to
// capture the Blob the download helper builds instead of hitting navigation.
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn();

let lastBlob: Blob | undefined;

// jsdom's Blob has no text(); read it through FileReader instead.
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// jsdom ships no URL.createObjectURL, so capture whatever is (not) there and
// restore it — Object.assign alone would leak the stub past this file if the
// client project ever ran with a shared context.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("downloadLegacyTraceAsJson", () => {
  beforeEach(() => {
    lastBlob = undefined;
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

  it("decodes \\uXXXX escapes so non-ASCII content is downloaded as real characters", async () => {
    downloadLegacyTraceAsJson({
      trace: {
        id: "trace-1",
        input: '{"question":"\\u3053\\u3093\\u306b\\u3061\\u306f"}',
      },
      observations: [
        { id: "obs-1", output: "\\u3042\\u308a\\u304c\\u3068\\u3046" },
      ],
    });

    expect(lastBlob).toBeDefined();
    const content = await readBlobAsText(lastBlob!);

    expect(content).toContain("こんにちは");
    expect(content).toContain("ありがとう");
    expect(content).not.toContain("\\u3053");
  });
});
