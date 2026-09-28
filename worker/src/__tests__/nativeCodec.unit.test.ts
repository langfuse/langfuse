import { describe, expect, it } from "vitest";
import { PreparedEvent, encodeClickhouseEvents } from "@langfuse/native";
import { createEvent } from "@langfuse/shared/src/server";
import { prepareNativeEvent } from "../services/IngestionService/prepareNativeEvent";

const preparedRow = () => ({
  project_id: "native-boundary",
  trace_id: "trace",
  span_id: "span",
  start_time: "2026-09-24 00:00:00.123456",
  created_at: "2026-09-24 00:00:00.123456",
  updated_at: "2026-09-24 00:00:00.123456",
  event_ts: "2026-09-24 00:00:00.123456",
  input: "🔥".repeat(1024),
  event_bytes: 123,
  tags: ["original"],
  usage_details: { input: 42 },
  cost_details: { input: 0.25 },
  model_parameters: JSON.stringify({
    temperature: 1,
    nested: ["🔥", -0, 1e-7, 2 ** 63, null],
    omitted: undefined,
  }),
});

describe("Native codec NAPI boundary", () => {
  it("prepares structured model parameters without mutating the TS row or double-encoding strings", async () => {
    const serialized = '{"temperature":0.2,"nested":["🔥",null]}';
    for (const [parameters, expected] of [
      [
        { temperature: 0.2, nested: ["🔥", null], omitted: undefined },
        serialized,
      ],
      [serialized, serialized],
      [null, ""],
      [undefined, ""],
    ] as const) {
      const row = {
        ...createEvent(preparedRow()),
        model_parameters: parameters,
      };
      const original = structuredClone(row);

      const prepared = prepareNativeEvent(row);
      expect(row).toEqual(original);
      expect(await encodeClickhouseEvents([prepared], 1)).toEqual(
        await encodeClickhouseEvents(
          [new PreparedEvent({ ...row, model_parameters: expected })],
          1,
        ),
      );
    }
  });

  it("owns its snapshot before async encoding, without calling toJSON", async () => {
    const row = preparedRow();
    const original = structuredClone(row);
    Object.assign(row, {
      toJSON: () => {
        throw new Error("the NAPI boundary must not serialize rows");
      },
    });

    const prepared = new PreparedEvent(row);
    const handles = Object.assign([prepared], {
      toJSON: () => {
        throw new Error("the NAPI boundary must not serialize the batch");
      },
    });
    const pending = encodeClickhouseEvents(handles, 1);
    row.input = "changed";
    row.tags[0] = "changed";
    row.usage_details.input = 99;
    row.cost_details.input = 99;
    row.event_bytes = 999;
    row.model_parameters = "changed";
    handles.length = 0;

    const blocks = await pending;
    const expected = await encodeClickhouseEvents(
      [new PreparedEvent(original)],
      1,
    );
    expect(blocks).toEqual(expected);
    expect(prepared.ids).toEqual({
      project_id: original.project_id,
      trace_id: original.trace_id,
      id: original.span_id,
    });
    prepared.ids.id = "changed";
    expect(prepared.ids.id).toBe(original.span_id);
    expect(await encodeClickhouseEvents([prepared], 1)).toEqual(expected);
    expect(Buffer.isBuffer(blocks[0].bytes)).toBe(true);
    expect(blocks[0].bytes.length).toBeGreaterThan(0);
  });

  it("merges handles into one wire block while retaining the input handles", async () => {
    const handles = [
      new PreparedEvent(preparedRow()),
      new PreparedEvent({ ...preparedRow(), span_id: "second" }),
    ];
    const [combined] = await encodeClickhouseEvents(handles, 2);
    const separate = await encodeClickhouseEvents(handles, 1);
    expect(combined.rowCount).toBe(2);
    expect(separate.map((block) => block.rowCount)).toEqual([1, 1]);
    // Batching writes the schema header once, instead of concatenating two complete blocks.
    expect(combined.bytes.length).toBeLessThan(
      separate.reduce((size, block) => size + block.bytes.length, 0),
    );
    expect(await encodeClickhouseEvents(handles, 2)).toEqual([combined]);
    expect(await encodeClickhouseEvents([], 1)).toEqual([]);
  });

  it("reads metadata once and preserves metadata-backed defaults", async () => {
    const names = [
      "evaluator_id",
      "evaluator_id",
      "evaluation_rule_id",
      "job_configuration_id",
      "evaluator_test",
      "evaluator_test",
    ];
    const values = ["first", "later", "", "fallback", "true", "false"];
    const trackArrayReads = <T>(items: T[]) => {
      const reads = items.map(() => 0);
      const array = [...items];
      items.forEach((item, index) => {
        Object.defineProperty(array, index, {
          configurable: true,
          enumerable: true,
          get: () => {
            reads[index] += 1;
            return item;
          },
        });
      });
      return { array, reads };
    };
    const trackedNames = trackArrayReads(names);
    const trackedValues = trackArrayReads(values);
    let namesReads = 0;
    let valuesReads = 0;
    const row = {
      ...preparedRow(),
      evaluator_id: null,
    };
    Object.defineProperties(row, {
      metadata_names: {
        enumerable: true,
        get: () => {
          namesReads += 1;
          return trackedNames.array;
        },
      },
      metadata_values: {
        enumerable: true,
        get: () => {
          valuesReads += 1;
          return trackedValues.array;
        },
      },
    });

    const prepared = new PreparedEvent(row);
    expect({ namesReads, valuesReads }).toEqual({
      namesReads: 1,
      valuesReads: 1,
    });
    expect(trackedNames.reads).toEqual(names.map(() => 1));
    expect(trackedValues.reads).toEqual(values.map(() => 1));
    for (const nullishValue of [null, undefined]) {
      expect(
        () =>
          new PreparedEvent({
            ...preparedRow(),
            metadata_names: ["evaluator_id"],
            metadata_values: [nullishValue],
          }),
      ).toThrow("evaluator_id");
    }
    const metadataDefaults = await encodeClickhouseEvents([prepared], 1);
    expect(metadataDefaults).toEqual(
      await encodeClickhouseEvents(
        [
          new PreparedEvent({
            ...preparedRow(),
            metadata_names: names,
            metadata_values: values,
            evaluator_id: "first",
            evaluation_rule_id: "fallback",
            evaluator_execution_is_test: true,
          }),
        ],
        1,
      ),
    );

    const overridden = new PreparedEvent({
      ...preparedRow(),
      metadata_names: names,
      metadata_values: values,
      evaluator_id: "explicit",
      evaluation_rule_id: "explicit-rule",
      evaluator_execution_is_test: false,
    });
    expect(await encodeClickhouseEvents([overridden], 1)).not.toEqual(
      metadataDefaults,
    );
  });

  it("reads only own enumerable map entries, including an own __proto__ key", async () => {
    const ownEntries = Object.fromEntries([
      ["input", 42],
      ["__proto__", 7],
    ]);
    const usage = Object.create(
      { inherited: 99 },
      Object.getOwnPropertyDescriptors(ownEntries),
    );
    Object.defineProperty(usage, "hidden", { value: 100 });
    usage[Symbol("symbol")] = 101;

    expect(
      await encodeClickhouseEvents(
        [new PreparedEvent({ ...preparedRow(), usage_details: usage })],
        1,
      ),
    ).toEqual(
      await encodeClickhouseEvents(
        [new PreparedEvent({ ...preparedRow(), usage_details: ownEntries })],
        1,
      ),
    );
  });

  it.each([
    ["prompt_version", 65_536],
    ["prompt_version", 1.5],
    ["is_deleted", 256],
    ["event_bytes", -1],
    ["event_bytes", 2 ** 64],
    ["usage_details", { input: 1.5 }],
    ["cost_details", { output: "not-a-number" }],
  ])("rejects invalid %s during preparation", (field, value) => {
    expect(
      () => new PreparedEvent({ ...preparedRow(), [field]: value }),
    ).toThrow(String(field));
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid JS block row limit %s",
    async (maxRows) => {
      await expect(async () =>
        encodeClickhouseEvents([new PreparedEvent(preparedRow())], maxRows),
      ).rejects.toThrow();
    },
  );
});
