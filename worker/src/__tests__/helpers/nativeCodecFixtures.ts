import {
  PreparedEvent,
  prepareOtelJson,
  type FinalizedOtelBatch,
  type OtelLookupRequest,
  type RustOtelBatch,
} from "@langfuse/native";
import { observationEvalFilterRecordColumns } from "@langfuse/shared";
import { encodeOtelLookups } from "../../features/otel-ingestion/encodeOtelLookups";

/** Rebuild every evaluation row from its filter row and the columns Rust still holds; each row can be taken once. */
export function takeEvaluationRows(
  batch: RustOtelBatch,
  finalized: FinalizedOtelBatch,
): object[] {
  return finalized
    .evaluationFilterRows!.flatMap((text): object[] => JSON.parse(text))
    .map((filterRow, index) => ({
      ...filterRow,
      ...batch.takeEvaluationRow(index),
    }));
}

export function constructPreparedEventFromJs() {
  // @ts-expect-error Rust creates the handle when it finalizes an event.
  return new PreparedEvent();
}

export function codecSpan(
  index: number,
  attributes: Record<string, string> = {},
) {
  return {
    traceId: "0123456789abcdef0123456789abcdef",
    spanId: index.toString(16).padStart(16, "0"),
    name: "native-codec",
    startTimeUnixNano: "1750000000123456000",
    endTimeUnixNano: "1750000001123456000",
    attributes: Object.entries(attributes).map(([key, stringValue]) => ({
      key,
      value: { stringValue },
    })),
  };
}

/** Finalized handles outlive their source batch; only external lookup results are supplied by JS. */
export async function prepareCodecRows(
  spans = [codecSpan(1)],
  lookup: (request: OtelLookupRequest) => object = () => ({
    model: null,
    pricingTiers: [],
  }),
) {
  const source = await prepareOtelJson(
    Buffer.from(JSON.stringify([{ scopeSpans: [{ spans }] }])),
    false,
  );
  let batch: RustOtelBatch | undefined;
  try {
    const prepared = await source.process({
      projectId: "native-boundary",
      fileKey: "codec.json",
      now: "2026-09-24T00:00:00.123Z",
      ingestionApiKey: "",
      ingestionSdkName: "test",
      ingestionSdkVersion: "test",
      isLangfuseInternal: false,
    });
    batch = prepared.batch;
    if (prepared.mediaRequests.length > 0)
      throw new Error("Unexpected codec fixture media");
    const { finalized } = await batch.complete(
      [],
      encodeOtelLookups(prepared.lookupRequests.map(lookup)),
      undefined,
      observationEvalFilterRecordColumns,
    );
    if (!finalized) throw new Error("Unexpected codec fixture overflow");
    return {
      events: finalized.events,
      evaluationRows: takeEvaluationRows(batch, finalized),
    };
  } finally {
    await batch?.dispose();
    await source.dispose();
  }
}
