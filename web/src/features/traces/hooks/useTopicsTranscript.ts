import { type TranscriptSource } from "@/src/features/traces/components/InternalTranscriptDialogController";
import { api } from "@/src/utils/api";

/** The trace rendered as Topics summarizer input; internal users only. */
export function useTopicsTranscript(source: TranscriptSource) {
  return api.events.topicsTranscriptByTraceId.useQuery(source);
}
