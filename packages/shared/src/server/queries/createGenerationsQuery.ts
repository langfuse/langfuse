import Decimal from "decimal.js";
import {
  type Observation,
  type EventsObservation,
  type ObservationCoreFields,
} from "../../domain";

export type ObservationPriceFields = {
  inputPrice: Decimal | null;
  outputPrice: Decimal | null;
  totalPrice: Decimal | null;
};

type AdditionalObservationFields = {
  traceName: string | null;
  traceTags: Array<string>;
  traceTimestamp: Date | null;
  // Tool counts for list view performance
  // (actual data fields: toolDefinitions, toolCalls, toolCallNames come from Observation domain type)
  toolDefinitionsCount: number | null;
  toolCallsCount: number | null;
} & ObservationPriceFields;

export type FullObservation = AdditionalObservationFields & Observation;

export type FullObservations = Array<FullObservation>;

export type FullObservationsWithScores = Array<
  FullObservation & { scores?: Record<string, string[] | number[]> | null }
>;

// Events-specific types that include userId and sessionId
export type FullEventsObservation = AdditionalObservationFields &
  EventsObservation;

export type FullEventsObservations = Array<FullEventsObservation>;

// Public API version of EventsObservation, some fields are omitted because
// V2 allows clients to specify fields
export type EventsObservationPublic = Partial<
  EventsObservation & ObservationPriceFields
> &
  ObservationCoreFields;
