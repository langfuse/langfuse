import { type TraceDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export type TraceDataTrace = Omit<
  WithStringifiedMetadata<TraceDomain>,
  "input" | "output"
> & {
  input: string | null;
  output: string | null;
  latency?: number;
  rootObservationType?: string;
  rootObservationId?: string;
};

export type TraceTarget =
  | { type: "trace"; traceId: string }
  | { type: "session"; sessionId: string };

export type TraceScope =
  | { type: "trace"; trace: TraceDataTrace }
  | {
      type: "session";
      projectId: string;
      sessionId: string;
      traces: TraceDataTrace[];
    };
