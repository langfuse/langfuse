import { type FilterState } from "@langfuse/shared";

type SampleObservation = {
  id: string;
  traceId: string | null;
  startTime: Date;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
};

export async function getLatestRuleSample(
  filter: FilterState,
  {
    getLatest,
    getDetails,
  }: {
    getLatest: (
      filter: FilterState,
    ) => Promise<SampleObservation | null | undefined>;
    getDetails: (sample: {
      id: string;
      traceId: string;
      startTime: Date;
    }) => Promise<SampleObservation>;
  },
) {
  const sample = await getLatest(filter);
  if (!sample?.traceId) return sample ?? null;
  return getDetails({
    id: sample.id,
    traceId: sample.traceId,
    startTime: sample.startTime,
  });
}
