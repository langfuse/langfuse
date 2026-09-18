import { get_encoding } from "tiktoken";
import { loadTraceSnapshot } from "./load-trace";
import { prepareTrace, serializeTraceTranscript } from "./transcript";

export function countTopicTokens(value: string): number {
  const encoding = get_encoding("o200k_base");
  try {
    return encoding.encode(value, "all", []).length;
  } finally {
    encoding.free();
  }
}

/** Regenerates the canonical transcript from current observations, without storing it. */
export async function loadTopicTranscript({
  projectId,
  traceId,
}: {
  projectId: string;
  traceId: string;
}) {
  const snapshot = await loadTraceSnapshot({ projectId, traceId });
  if (snapshot.projectId !== projectId || snapshot.traceId !== traceId)
    throw new Error("Topics trace scope mismatch.");
  return {
    traceTimestamp: snapshot.timestamp,
    transcript: serializeTraceTranscript(prepareTrace(snapshot.observations)),
  };
}
