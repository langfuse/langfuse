import { constructZodLiteralUnionType } from "@/src/utils/zod";
import { z } from "zod";

export const availableParameters = {
  "chat-openai": [
    {
      id: "temperature",
      name: "Temperature",
      defaultValue: 1,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: "max_tokens",
      name: "Maximum length",
      defaultValue: undefined,
      min: 1,
      max: 2048,
      step: 1,
    },
    {
      id: "top_p",
      name: "Top P",
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      id: "frequency_penalty",
      name: "Frequency penalty",
      defaultValue: 0,
      min: -2,
      max: 2,
      step: 0.01,
    },
    {
      id: "presence_penalty",
      name: "Presence penalty",
      defaultValue: 0,
      min: -2,
      max: 2,
      step: 0.01,
    },
    {
      id: "seed",
      name: "Seed",
      defaultValue: undefined,
      min: 0,
      max: 2048,
      step: 1,
    },
  ],
  "completion-openai": [
    {
      id: "temperature",
      name: "Temperature",
      defaultValue: 1,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: "max_tokens",
      name: "Maximum length",
      defaultValue: 16,
      min: 1,
      max: 2048,
      step: 1,
    },
    {
      id: "top_p",
      name: "Top P",
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      id: "frequency_penalty",
      name: "Frequency penalty",
      defaultValue: 0,
      min: -2,
      max: 2,
      step: 0.01,
    },
    {
      id: "presence_penalty",
      name: "Presence penalty",
      defaultValue: 0,
      min: -2,
      max: 2,
      step: 0.01,
    },
    {
      id: "best_of",
      name: "Best of",
      defaultValue: 1,
      min: 1,
      max: 10,
      step: 1,
    },
    {
      id: "seed",
      name: "Seed",
      defaultValue: undefined,
      min: 0,
      max: 2048,
      step: 1,
    },
  ],
} as const;

export const availableModels = [
  { model: "gpt-3.5-turbo-16k-0613", modes: ["chat"], providers: ["openai"] },
  { model: "gpt-3.5-turbo-16k", modes: ["chat"], providers: ["openai"] },
  { model: "gpt-3.5-turbo-1106", modes: ["chat"], providers: ["openai"] },
  { model: "gpt-3.5-turbo-0613", modes: ["chat"], providers: ["openai"] },
  { model: "gpt-3.5-turbo-0301", modes: ["chat"], providers: ["openai"] },
  { model: "gpt-3.5-turbo", modes: ["chat"], providers: ["openai"] },
  {
    model: "gpt-3.5-turbo-instruct-0914",
    modes: ["completion"],
    providers: ["openai"],
  },
  {
    model: "gpt-3.5-turbo-instruct",
    modes: ["completion"],
    providers: ["openai"],
  },
  {
    model: "davinci-002",
    modes: ["completion"],
    providers: ["openai"],
  },
  {
    model: "babbage-002",
    modes: ["completion"],
    providers: ["openai"],
  },
] as const;
export type AvailableModel = (typeof availableModels)[number]["model"];
export const availableModelSchema = constructZodLiteralUnionType(
  availableModels.map(({ model }) => z.literal(model)),
);
export const isAvailableModel = (model: string): model is AvailableModel =>
  !!availableModels.find((availableModel) => availableModel.model === model);

const ProviderType = constructZodLiteralUnionType(
  availableModels
    .map(({ providers }) => providers.map((a) => z.literal(a)))
    .flat(),
);
export type AvailableProvider = z.infer<typeof ProviderType>;
export const availableProviderSchema = constructZodLiteralUnionType(
  availableModels
    .map(({ providers }) => providers.map((a) => z.literal(a)))
    .flat(),
);
export const isAvailableProvider = (
  provider: string,
): provider is AvailableProvider =>
  availableModels.some((availableModel) =>
    availableModel.providers.some(
      (availableModelProvider) => availableModelProvider === provider,
    ),
  );

export const availableModes = ["chat", "completion"] as const;
export type AvailableMode = (typeof availableModes)[number];
export const isAvailableMode = (mode: string): mode is AvailableMode =>
  !!availableModes.find((availableMode) => availableMode === mode);

export const playgroundHistoryStatuses = [
  "created",
  "completed",
  "error",
] as const;
export type PlaygroundHistoryStatus =
  (typeof playgroundHistoryStatuses)[number];
