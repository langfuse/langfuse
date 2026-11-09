import { describe, expect, it } from "vitest";
import { encodeClickhouseEvents } from "@langfuse/native";
import { codecSpan, prepareCodecRows } from "./helpers/nativeCodecFixtures";

describe("Native codec NAPI boundary", () => {
  it("retains Rust-owned rows while handles and evaluation snapshots change during encoding", async () => {
    const { events, evaluationRows } = await prepareCodecRows([
      codecSpan(1, {
        "langfuse.observation.input": "🔥".repeat(1024),
        "langfuse.observation.usage_details": '{"input":42}',
        "langfuse.observation.cost_details": '{"input":0.25}',
      }),
    ]);
    const prepared = events[0].event;
    const expected = await encodeClickhouseEvents([prepared], 1);
    const handles = Object.assign([prepared], {
      toJSON: () => {
        throw new Error("the NAPI boundary must not serialize the batch");
      },
    });
    const pending = encodeClickhouseEvents(handles, 1);
    Object.assign(evaluationRows[0], {
      input: "changed",
      usage_details: { input: 99 },
      cost_details: { input: 99 },
    });
    handles.length = 0;

    const blocks = await pending;
    expect(blocks).toEqual(expected);
    expect(prepared.ids).toEqual({
      project_id: "native-boundary",
      trace_id: "0123456789abcdef0123456789abcdef",
      id: "0000000000000001",
    });
    prepared.ids.id = "changed";
    expect(prepared.ids.id).toBe("0000000000000001");
    expect(await encodeClickhouseEvents([prepared], 1)).toEqual(expected);
    expect(Buffer.isBuffer(blocks[0].bytes)).toBe(true);
    expect(blocks[0].bytes.length).toBeGreaterThan(0);
  });

  it("merges handles into one wire block while retaining the input handles", async () => {
    const { events } = await prepareCodecRows([
      codecSpan(1),
      codecSpan(2),
      codecSpan(3),
    ]);
    const handles = events.map(({ event }) => event);
    const [combined] = await encodeClickhouseEvents(handles, 3);
    const separate = await encodeClickhouseEvents(handles, 2);
    expect(combined.rowCount).toBe(3);
    expect(separate.map((block) => block.rowCount)).toEqual([2, 1]);
    // Batching writes the schema header once, instead of concatenating two complete blocks.
    expect(combined.bytes.length).toBeLessThan(
      separate.reduce((size, block) => size + block.bytes.length, 0),
    );
    expect(await encodeClickhouseEvents(handles, 3)).toEqual([combined]);
    expect(await encodeClickhouseEvents([], 1)).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid JS block row limit %s",
    async (maxRows) => {
      const { events } = await prepareCodecRows();
      await expect(async () =>
        encodeClickhouseEvents([events[0].event], maxRows),
      ).rejects.toThrow();
    },
  );
});
