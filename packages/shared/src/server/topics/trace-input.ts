import { loadTraceSnapshot } from "./load-trace";
import { prepareTrace, serializeTraceTranscript } from "./transcript";

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
    unitStartTime: snapshot.timestamp,
    sessionId: snapshot.sessionId,
    environment: snapshot.environment,
    traceName: snapshot.traceName,
    transcript: serializeTraceTranscript(prepareTrace(snapshot.observations)),
  };
}
