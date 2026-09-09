/**
 * Tests for the playground completion stream's UTF-8 decoding.
 *
 * /api/chatCompletion streams the provider's raw text through a
 * TextEncoderStream, so chunk boundaries fall on arbitrary byte offsets and
 * routinely split a multi-byte character in two.
 */
import { getChatCompletionStream } from "@/src/features/playground/page/context";

const originalFetch = global.fetch;

/** Streams `text` as UTF-8, emitting `chunkSize` bytes at a time. */
function mockStreamingFetch(text: string, chunkSize: number) {
  const bytes = new TextEncoder().encode(text);

  global.fetch = (() =>
    Promise.resolve({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += chunkSize) {
            controller.enqueue(bytes.slice(i, i + chunkSize));
          }
          controller.close();
        },
      }),
    })) as unknown as typeof global.fetch;
}

async function collectCompletion(): Promise<string> {
  let output = "";
  for await (const token of getChatCompletionStream(
    "project-id",
    [],
    {} as never,
  )) {
    output += token;
  }
  return output;
}

describe("getChatCompletionStream", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should not corrupt multi-byte characters split across chunks", async () => {
    const text = "Hola 🌍, 你好 — café";
    // 1 byte per chunk splits every multi-byte character.
    mockStreamingFetch(text, 1);

    expect(await collectCompletion()).toBe(text);
  });

  it("should decode correctly for chunk sizes that straddle character boundaries", async () => {
    const text = "🌍你好café🌍你好café";

    for (const chunkSize of [2, 3, 5, 7]) {
      mockStreamingFetch(text, chunkSize);
      expect(await collectCompletion()).toBe(text);
    }
  });

  it("should pass through pure ASCII unchanged", async () => {
    const text = "The quick brown fox jumps over the lazy dog";
    mockStreamingFetch(text, 4);

    expect(await collectCompletion()).toBe(text);
  });
});
