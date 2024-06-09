import { type Observation } from "@langfuse/shared/src/db";
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

const chatModels = [
  "gpt-4",
  "gpt-4-0314",
  "gpt-4-0613",
  "gpt-4-32k",
  "gpt-4-32k-0314",
  "gpt-4-32k-0613",
  "gpt-3.5-turbo",
  "gpt-35-turbo",
  "gpt-3.5-turbo-0301",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-16k-0613",
  "gpt-4-1106-preview",
  "gpt-4-vision-preview",
  "gpt-4o-2024-05-13",
  "gpt-4o",
];

export type ChatModel = (typeof chatModels)[number];

export const isChatModel = (model: string): model is ChatModel => {
  return chatModels.includes(model);
};
