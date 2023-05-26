import { type Observation, type Prisma } from "@prisma/client";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "../server/api/root";

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

export const dateTimeAggregationOptions = [
  "1 year",
  "3 months",
  "1 month",
  "7 days",
  "24 hours",
  "1 hour",
] as const;

export type DateTimeAggregationOption =
  (typeof dateTimeAggregationOptions)[number];

export const dateTimeAggregationSettings: Record<
  DateTimeAggregationOption,
  {
    date_trunc: string;
    date_formatter: (date: Date) => string;
  }
> = {
  "1 year": {
    date_trunc: "month",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { year: "2-digit", month: "short" }),
  },
  "3 months": {
    date_trunc: "week",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  },
  "1 month": {
    date_trunc: "day",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  },
  "7 days": {
    date_trunc: "day",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  },
  "24 hours": {
    date_trunc: "hour",
    date_formatter: (date) =>
      date.toLocaleTimeString("en-US", { hour: "numeric" }),
  },
  "1 hour": {
    date_trunc: "minute",
    date_formatter: (date) =>
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" }),
  },
};
