import { type Observation } from "@langfuse/shared";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

// unreachable code check

export { assertUnreachable } from "@langfuse/shared";

// primitive type checks

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

// non-primitive type checks

type NestedObservation = ObservationReturnType & {
  children: NestedObservation[];
};

type Event = Observation & {
  type: "EVENT";
};

type Span = Observation & {
  type: "SPAN";
  endTime: Date; // not null
};

type Generation = Observation & {
  type: "GENERATION";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelParameters: {
    [key: string]: string | number | boolean;
  };
};

type Agent = Observation & {
  type: "AGENT";
};

type Tool = Observation & {
  type: "TOOL";
};

type Chain = Observation & {
  type: "CHAIN";
};

type Retriever = Observation & {
  type: "RETRIEVER";
};

type Evaluator = Observation & {
  type: "EVALUATOR";
};

type Embedding = Observation & {
  type: "EMBEDDING";
};

type Guardrail = Observation & {
  type: "GUARDRAIL";
};

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const isNotNullOrUndefined = <T>(
  val?: T | null,
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);
