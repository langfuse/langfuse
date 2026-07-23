import React from "react";
import preview from "../../../../../../.storybook/preview";
import { LazyJsonViewer } from "./LazyJsonViewer";

/**
 * Demo surface for the lazy JSON renderer (LFE-11080). Every value below is
 * built entirely in the browser and handed to the viewer as an in-memory value;
 * the viewer serializes it to UTF-8 bytes and drives the same byte-indexer the
 * streamed ~1 GB path will use. The point of the large/deep/wide stories is to
 * show cost stays proportional to what is expanded — the viewer never builds a
 * node per element up front.
 */

// A wide array of realistic-looking records — the "conversation / tool-dump"
// shape that froze the old viewer. 20k rows, but only a page renders at once.
const wideRecords = Array.from({ length: 20_000 }, (_, i) => ({
  id: i,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `Message ${i}: ${"lorem ipsum dolor sit amet ".repeat(3)}`,
  tokens: (i * 7) % 4096,
  metadata: { ts: 1_700_000_000 + i, ok: i % 5 !== 0 },
}));

// A deep chain — expanding drills down one materialized level at a time.
function deepChain(depth: number): unknown {
  let node: unknown = { leaf: "bottom", depth };
  for (let d = depth - 1; d >= 0; d--) {
    node = { depth: d, label: `level-${d}`, next: node };
  }
  return node;
}

// A leaf whose value is far larger than its preview — copy materializes it on
// demand rather than rendering it inline.
const hugeStringPayload = {
  note: "the value below is ~2 MB; only a bounded preview renders",
  blob: "A".repeat(2_000_000),
  trailing: 42,
};

// Note: numeric-precision preservation (bigint / long-fraction) is a property
// of parsing from raw JSON *bytes*; the in-memory entry receives an already-
// parsed JS value, so precision was resolved upstream. That story belongs with
// the streamed/byte source (LFE-11082), not here.

const meta = preview.meta({
  component: LazyJsonViewer,
  args: {
    value: { hello: "world", nested: { a: 1, b: [1, 2, 3] } },
  },
  decorators: [
    (Story) => (
      <div
        style={{ height: 520 }}
        className="bg-background w-full overflow-hidden rounded-md border"
      >
        <Story />
      </div>
    ),
  ],
});

export const Small = meta.story({});

export const WideArray = meta.story({
  args: { value: wideRecords },
});

export const DeepChain = meta.story({
  args: { value: deepChain(400) },
});

export const HugeStringLeaf = meta.story({
  args: { value: hugeStringPayload },
});
