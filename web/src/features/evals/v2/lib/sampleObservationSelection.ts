import { type EventsTableRow } from "@/src/features/events/components/EventsTable";

export type SampleObservationOption = {
  id: string;
  traceId: string;
  name: string | null;
  startTime: Date;
};

export function toSampleObservationOptions(
  rows: EventsTableRow[],
): SampleObservationOption[] {
  const seen = new Set<string>();
  const options: SampleObservationOption[] = [];
  for (const row of rows) {
    if (!row.traceId || seen.has(row.id)) continue;
    seen.add(row.id);
    options.push({
      id: row.id,
      traceId: row.traceId,
      name: row.name ?? null,
      startTime: row.startTime,
    });
  }
  return options;
}

export function reconcileSampleObservationOptions(
  current: SampleObservationOption[] | null,
  rows: EventsTableRow[],
) {
  const next = toSampleObservationOptions(rows);
  // EventsTable reports its rows after rendering. Preserve the state reference
  // when that report is unchanged so the parent does not trigger it again.
  const unchanged =
    current !== null &&
    current.length === next.length &&
    current.every(
      (option, index) =>
        option.id === next[index]?.id &&
        option.traceId === next[index]?.traceId &&
        option.name === next[index]?.name &&
        option.startTime.getTime() === next[index]?.startTime.getTime(),
    );
  return unchanged ? current : next;
}

export function resolveSampleObservation(
  options: SampleObservationOption[],
  pickedObservation: SampleObservationOption | null,
) {
  if (!pickedObservation) return options[0] ?? null;
  return (
    options.find((option) => option.id === pickedObservation.id) ??
    pickedObservation
  );
}
