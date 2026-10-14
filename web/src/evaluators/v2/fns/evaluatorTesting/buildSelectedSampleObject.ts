import { zipToolCallsFromRecord } from "@langfuse/shared";

export function buildSelectedSampleObject<
  TObservation extends object,
  TEventDetails extends object,
>({
  observation,
  eventDetails,
}: {
  observation: TObservation | null;
  eventDetails: TEventDetails | null | undefined;
}) {
  if (!observation || !eventDetails) return null;

  return {
    ...observation,
    ...eventDetails,
    toolCalls: zipToolCallsFromRecord(eventDetails),
  };
}
