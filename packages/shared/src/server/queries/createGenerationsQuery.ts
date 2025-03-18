import { ObservationView } from "../repositories";

type AdditionalObservationFields = {
  traceName: string | null;
  traceTags: Array<string>;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
};

export type FullObservation = AdditionalObservationFields & ObservationView;

export type FullObservations = Array<FullObservation>;

export type FullObservationsWithScores = Array<
  FullObservation & { scores?: Record<string, string[] | number[]> | null }
>;

export type IOAndMetadataOmittedObservations = Array<
  Omit<ObservationView, "input" | "output" | "metadata"> &
    AdditionalObservationFields
>;
