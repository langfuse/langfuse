import { type Observation, type Prisma } from "@prisma/client";

export type NestedObservation = Observation & {
  children: NestedObservation[];
};

// TODO: Marc add types for span and event

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
