import { assembleTranscript } from "@langfuse/shared/src/server/transcript/transcript";
import { orderObservations } from "@langfuse/shared/src/server/transcript/ordering";
import type { TranscriptObservation } from "@langfuse/shared/src/server/transcript/types";

/**
 * Threads for one observation's I/O. Assembly only keeps generations and
 * tools, so a root span returns null.
 */
export function threadsFromObservationIo(observation: {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  type: string;
  name: string | null;
  startTime: Date;
  endTime: Date | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
}) {
  const transcript = assembleTranscript(
    orderObservations([
      {
        id: observation.id,
        traceId: observation.traceId,
        parentObservationId: observation.parentObservationId,
        type: observation.type,
        name: observation.name,
        startTime: observation.startTime,
        endTime: observation.endTime,
        input: observation.input,
        output: observation.output,
        metadata: observation.metadata,
      } as TranscriptObservation,
    ]),
  );
  if (!transcript) return null;
  return JSON.parse(JSON.stringify(transcript.threads)) as unknown;
}
