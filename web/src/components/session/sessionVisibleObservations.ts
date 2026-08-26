import isEqual from "lodash/isEqual";

// Display copy for the per-card observation cap; the authoritative limit is
// SESSION_OBSERVATIONS_PER_TRACE_LIMIT in the sessions router.
export const SESSION_CARD_OBSERVATIONS_NOTICE_COUNT = 50;

export type SessionObservationVisibilityFields = {
  id: string;
  input: unknown;
  output: unknown;
  inputLength: number;
  outputLength: number;
};

const hasContent = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

const observationHasIO = (
  observation: Pick<SessionObservationVisibilityFields, "input" | "output">,
): boolean => hasContent(observation.input) || hasContent(observation.output);

export const getVisibleSessionObservations = <
  TObservation extends SessionObservationVisibilityFields,
>(
  response:
    | readonly TObservation[]
    | { observations?: readonly TObservation[] }
    | undefined,
  traceId: string,
): {
  visibleObservations: readonly TObservation[] | undefined;
  hasMoreObservations: boolean;
} => {
  const observations = Array.isArray(response)
    ? response
    : (response as { observations?: readonly TObservation[] } | undefined)
        ?.observations;
  if (!observations) {
    return { visibleObservations: undefined, hasMoreObservations: false };
  }

  const syntheticTraceRowId = `t-${traceId}`;
  let realCount = 0;
  let realShown = 0;
  const page: TObservation[] = [];

  for (const observation of observations) {
    if (observation.id === syntheticTraceRowId) {
      page.push(observation);
      continue;
    }
    realCount++;
    if (realShown >= SESSION_CARD_OBSERVATIONS_NOTICE_COUNT) continue;
    page.push(observation);
    realShown++;
  }

  const syntheticRow = page.find(
    (observation) => observation.id === syntheticTraceRowId,
  );
  const realObservations = page.filter(
    (observation) => observation.id !== syntheticTraceRowId,
  );
  const syntheticRowIsRedundant =
    !syntheticRow ||
    !observationHasIO(syntheticRow) ||
    realObservations.some(
      (observation) =>
        (hasContent(syntheticRow.input) &&
          isEqual(observation.input, syntheticRow.input) &&
          observation.inputLength === syntheticRow.inputLength) ||
        (hasContent(syntheticRow.output) &&
          isEqual(observation.output, syntheticRow.output) &&
          observation.outputLength === syntheticRow.outputLength),
    );

  return {
    visibleObservations: !syntheticRowIsRedundant
      ? page
      : realObservations.length > 0
        ? realObservations
        : page,
    hasMoreObservations: realCount > SESSION_CARD_OBSERVATIONS_NOTICE_COUNT,
  };
};
