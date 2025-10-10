import Decimal from "decimal.js";
import { Observation } from "../../domain";

export type ObservationPriceFields = {
  inputPrice: Decimal | null;
  outputPrice: Decimal | null;
  totalPrice: Decimal | null;
};

type AdditionalObservationFields = {
  traceName: string | null;
  traceTags: Array<string>;
  traceTimestamp: Date | null;
} & ObservationPriceFields;

export type FullObservation = AdditionalObservationFields & Observation;

export type FullObservations = Array<FullObservation>;

export type FullObservationsWithScores = Array<
  FullObservation & { scores?: Record<string, string[] | number[]> | null }
>;
