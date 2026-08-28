import type { ResourceSpan } from "../../../../server/otel/OtelIngestionProcessor";
import type { NormalizedIO, SpanIO } from "../../types";

type OtelScopeSpan = NonNullable<ResourceSpan["scopeSpans"]>[number];

export type NormalizedIOFixture = {
  name: string;
  otel?: {
    scopeSpan: OtelScopeSpan;
    resourceAttributes: Record<string, unknown>;
  };
  spanIO: SpanIO;
  expected: Omit<NormalizedIO, "span">;
};
