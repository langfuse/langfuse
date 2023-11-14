import { type Observation } from "@prisma/client";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";
import {
  type DateTimeAggregationOption,
  dateTimeAggregationOptions,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

export type NestedObservation = ObservationReturnType & {
  children: NestedObservation[];
};

export type TypedObservation = Event | Span | Generation;

export type Event = Observation & {
  type: "EVENT";
};

export type Span = Observation & {
  type: "SPAN";
  endTime: Date; // not null
};

export type LLMChatMessages = { role: string; content: string };

export type Generation = Observation & {
  type: "GENERATION";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelParameters: {
    [key: string]: string | number | boolean;
  };
};

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

export const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const isNotNullOrUndefined = <T>(
  val?: T | null,
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);

export function isValidOption(
  value: unknown,
): value is DateTimeAggregationOption {
  return (
    typeof value === "string" &&
    dateTimeAggregationOptions.includes(value as DateTimeAggregationOption)
  );
}
