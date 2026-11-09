import {
  prepareOtelJson,
  type OtelLookupRequest,
  type RustOtelBatch,
} from "@langfuse/native";

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
      prepared.lookupRequests.map(lookup),
      undefined,
      true,
    );
    if (!finalized) throw new Error("Unexpected codec fixture overflow");
    return finalized;
  } finally {
    await batch?.dispose();
    await source.dispose();
  }
}
