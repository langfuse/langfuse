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

export type Agent = Observation & {
  type: "AGENT";
};

export type Tool = Observation & {
  type: "TOOL";
};

export type Chain = Observation & {
  type: "CHAIN";
};

export type Retriever = Observation & {
  type: "RETRIEVER";
};

export type Evaluator = Observation & {
  type: "EVALUATOR";
};

export type Embedding = Observation & {
  type: "EMBEDDING";
};

export type Guardrail = Observation & {
  type: "GUARDRAIL";
};

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

export const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const isNotNullOrUndefined = <T>(
  val?: T | null,
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);
