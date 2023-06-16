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
    prompt?: { role: string; content: string }[];
    completion?: string;
    tokens?: {
      promptAmount?: number;
      completionAmount?: number;
    };
    model?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
};

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
