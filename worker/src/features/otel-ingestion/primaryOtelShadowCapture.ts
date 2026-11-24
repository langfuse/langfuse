import type { OtelShadowRowLocator } from "./otelShadowRowKey";
import type {
  OtelEffect,
  OtelMediaUploadEffect,
  OtelSchedulingContextEffect,
  OtelShadowCapture,
} from "./otelEffectsCapture";
type MediaIdentity = Pick<
  OtelMediaUploadEffect,
  | "projectId"
  | "traceId"
  | "observationId"
  | "field"
  | "contentType"
  | "sha256Hash"
  | "origin"
  | "writePath"
  | "mediaPath"
>;

const uploadKey = (e: MediaIdentity) =>
  JSON.stringify([
    e.projectId,
    e.traceId,
    e.observationId,
    e.field,
    e.contentType,
    e.sha256Hash,
    e.origin,
  ]);

// These identify actual requested operations. Dispatch's capacity estimate is
// intentionally approximate and the dry-run evaluation upload uses a synthetic path.
function intentKey(
  e: Exclude<
    OtelEffect,
    | OtelSchedulingContextEffect
    | { kind: "capture-failure" }
    | { kind: "operation-failure" }
  >,
): string {
  switch (e.kind) {
    case "media":
      return uploadKey(e);
    case "eval-upsert":
      return JSON.stringify([
        e.projectId,
        e.jobExecutionId,
        e.jobConfigurationId,
      ]);
    case "eval-blob-upload":
      return JSON.stringify([
        e.projectId,
        e.traceId,
        e.observationId,
        e.observationHash,
      ]);
    case "trace-recording":
      return JSON.stringify([
        e.projectId,
        e.traceId,
        e.spanStartTimeISO,
        [...e.ruleIds].sort(),
      ]);
    case "observation-eval":
      return JSON.stringify([
        e.projectId,
        e.traceId,
        e.observationId,
        e.jobExecutionId,
        e.jobConfigurationId,
        e.jobTemplateId,
        e.request.evaluatorId,
        e.request.evaluationRuleId,
        e.request.evalTemplateType,
        e.request.executionMode,
        e.request.delay,
        e.request.variableMapping,
        e.request.batchActionId,
      ]);
  }
}

type IntentKind = OtelEffect["kind"] | "event";
export type OtelShadowFailure = Extract<
  OtelEffect,
  { kind: "operation-failure" | "capture-failure" }
>;

export function createIntentCounts() {
  let complete = true;
  const counts = new Map<IntentKind, Map<string, number>>();
  const failures: OtelShadowFailure[] = [];
  const add = (kind: IntentKind, key: string) => {
    let entries = counts.get(kind);
    if (!entries) {
      entries = new Map();
      counts.set(kind, entries);
    }
    entries.set(key, (entries.get(key) ?? 0) + 1);
  };
  const markIncomplete = (failure?: OtelShadowFailure) => {
    complete = false;
    if (failure) failures.push(failure);
  };
  return {
    counts,
    failures,
    markIncomplete,
    add,
    get complete() {
      return complete;
    },
    capture(e: OtelEffect) {
      if (e.kind === "scheduling-context") return;
      if (e.kind === "capture-failure" || e.kind === "operation-failure") {
        markIncomplete(e);
        return;
      }
      add(e.kind, intentKey(e));
    },
  };
}

export function compareIntentCounts(
  primary: ReturnType<typeof createIntentCounts>,
  native: ReturnType<typeof createIntentCounts>,
) {
  const differences = [];
  for (const kind of new Set([
    ...primary.counts.keys(),
    ...native.counts.keys(),
  ])) {
    const expected = primary.counts.get(kind);
    const actual = native.counts.get(kind);
    let missing = 0,
      extra = 0;
    for (const key of new Set([
      ...(expected?.keys() ?? []),
      ...(actual?.keys() ?? []),
    ])) {
      const delta = (actual?.get(key) ?? 0) - (expected?.get(key) ?? 0);
      if (delta > 0) extra += delta;
      else missing -= delta;
    }
    if (missing || extra) differences.push({ kind, missing, extra });
  }
  return differences;
}

export function createOtelShadowCapture() {
  const intents = createIntentCounts();
  const uploads = new Map<
    string,
    { results: OtelMediaUploadEffect["result"][]; used: number }
  >();
  let scheduling: OtelSchedulingContextEffect | undefined;
  const rowLocators: OtelShadowRowLocator[] = [];
  const terminal = Promise.withResolvers<"inserted" | "empty" | "dropped">();
  let queued = 0;
  let finished = 0;
  let dropped = false;
  let sealed = false;
  const settle = () => {
    if (sealed && finished === queued) {
      if (dropped) terminal.resolve("dropped");
      else terminal.resolve(queued ? "inserted" : "empty");
    }
  };
  const hooks = {
    capture(e) {
      if (e.kind === "scheduling-context") {
        scheduling = e;
        return;
      }
      intents.capture(e);
      if (e.kind === "media") {
        const key = uploadKey(e);
        let attempts = uploads.get(key);
        if (!attempts) {
          attempts = { results: [], used: 0 };
          uploads.set(key, attempts);
        }
        attempts.results.push(e.result);
      }
    },
    onEventWriteQueued(row) {
      queued++;
      intents.add("event", JSON.stringify([row.trace_id, row.span_id]));
    },
    onEventWriteTerminal({ status, row }) {
      if (status === "dropped") dropped = true;
      else
        rowLocators.push({
          traceId: row.trace_id,
          spanId: row.span_id,
          startTime: row.start_time,
        });
      finished++;
      settle();
    },
    onCaptureFailure() {
      intents.markIncomplete();
    },
  } satisfies OtelShadowCapture;
  return {
    ...hooks,
    intents,
    rowLocators,
    get scheduling() {
      return scheduling;
    },
    replayUpload(identity: MediaIdentity) {
      const attempts = uploads.get(uploadKey(identity));
      return attempts && attempts.results[attempts.used++];
    },
    waitForPrimaryInserts() {
      // Ack can arrive before the last enqueue. Only seal after the TS batch returns.
      sealed = true;
      settle();
      return terminal.promise;
    },
  };
}
