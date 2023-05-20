import { type Observation, type Prisma } from "@prisma/client";

export type LlmCall = Observation & {
  attributes: {
    prompt?: string;
    completion?: string;
    tokens: {
      prompt?: number;
      completion?: number;
    };
    model: Prisma.JsonValue;
  };
};
