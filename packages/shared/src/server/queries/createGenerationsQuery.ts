import { Observation } from "../../domain";

type AdditionalObservationFields = {
  traceName: string | null;
  traceTags: Array<string>;
};

export type FullObservation = AdditionalObservationFields & Observation;

export type FullObservations = Array<FullObservation>;

export type FullObservationsWithScores = Array<
  FullObservation & { scores?: Record<string, string[] | number[]> | null }
>;
