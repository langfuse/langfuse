import { type Observation, type Prisma } from "@prisma/client";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";

export type NestedObservation = Observation & {
  children: NestedObservation[];
};

export type TypedObservation = Event | Span | LlmCall;

export type Event = Observation & {
  type: "EVENT";
};

export type Span = Observation & {
  type: "SPAN";
  endTime: Date; // not null
};

export type LlmCall = Observation & {
  type: "LLMCALL";
  attributes: {
    prompt?: string;
    completion?: string;
    tokens?: {
      prompt?: number;
      completion?: number;
    };
    model: Prisma.JsonValue;
  };
};

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
