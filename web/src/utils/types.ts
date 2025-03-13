import { type Observation } from "@langfuse/shared";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

// primitive type checks

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

// non-primitive type checks

export type NestedObservation = ObservationReturnType & {
  children: NestedObservation[];
};

export type Event = Observation & {
  type: "EVENT";
};

export type Span = Observation & {
  type: "SPAN";
  endTime: Date; // not null
};

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
