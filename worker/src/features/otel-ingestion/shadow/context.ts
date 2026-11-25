import { createHash } from "node:crypto";
import { stableJsonStringify } from "@langfuse/shared";
import type { OtelMediaWrite } from "../../otel-media/uploadHooks";
import { schedulingHooks } from "./eval";
import type { OtelShadowRowLocator } from "./rowKey";

type Effect = {
  primary: number;
  native: number;
  results: { value: unknown }[];
};

export class ShadowScope {
  readonly media: OtelMediaWrite = (request, primary) =>
    this.effect(
      "media",
      [
        request.projectId,
        request.traceId,
        request.observationId ?? null,
        request.field,
        request.contentType,
        request.origin,
        request.sha256Hash,
      ],
      primary,
    );
  readonly scheduling;
  readonly recordIngestionMetrics;
  readonly onFailure = (stage: string) => this.fail(stage);
  readonly failures: Record<string, number> = {};
  attemptedPrimaryEffect = false;
  readonly rows: OtelShadowRowLocator[] = [];
  readonly onRowEnqueued = (row: OtelShadowRowLocator) => {
    this.rows.push(row);
  };

  constructor(
    readonly side: "primary" | "native",
    readonly effects = new Map<string, Map<string, Effect>>(),
  ) {
    this.scheduling = schedulingHooks(this);
    this.recordIngestionMetrics = side !== "native";
  }

  private occurrence(kind: string, identity: unknown) {
    try {
      const digest = createHash("sha256")
        .update(stableJsonStringify(identity))
        .digest("base64");
      const group = this.effects.get(kind) ?? new Map<string, Effect>();
      const entry = group.get(digest) ?? { primary: 0, native: 0, results: [] };
      group.set(digest, entry);
      this.effects.set(kind, group);
      return { entry, index: entry[this.side]++ };
    } catch {
      this.fail("capture");
    }
  }

  /** Identical requests replay in invocation order, even when uploads finish out of order. */
  async effect<T>(
    kind: string,
    identity: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const occurrence = this.occurrence(kind, identity);
    if (this.side === "primary") {
      this.attemptedPrimaryEffect = true;
      try {
        const value = await run();
        if (occurrence) occurrence.entry.results[occurrence.index] = { value };
        return value;
      } catch (error) {
        this.fail(kind);
        throw error;
      }
    }
    const observed = occurrence?.entry.results[occurrence.index];
    if (observed) return observed.value as T;
    this.fail(
      occurrence && occurrence.index < occurrence.entry.primary
        ? kind
        : "missing_effect",
    );
    throw new Error("No successful primary result for this operation");
  }

  fail(stage: string) {
    this.failures[stage] = (this.failures[stage] ?? 0) + 1;
  }
}

export function effectDifferences(primary: ShadowScope) {
  const differences = [];
  for (const [kind, group] of primary.effects) {
    let missing = 0;
    let extra = 0;
    for (const { primary, native } of group.values()) {
      missing += Math.max(0, primary - native);
      extra += Math.max(0, native - primary);
    }
    if (missing || extra) differences.push({ kind, missing, extra });
  }
  return differences;
}
