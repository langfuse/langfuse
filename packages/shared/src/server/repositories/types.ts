import { Prisma, ScoreDataType } from "@prisma/client";
import Decimal from "decimal.js";

export type TableCount = {
  count: number;
};

export const ObservationType = {
  SPAN: "SPAN",
  EVENT: "EVENT",
  GENERATION: "GENERATION",
} as const;
export type ObservationType =
  (typeof ObservationType)[keyof typeof ObservationType];
export const ObservationLevel = {
  DEBUG: "DEBUG",
  DEFAULT: "DEFAULT",
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const;
export type ObservationLevelType =
  (typeof ObservationLevel)[keyof typeof ObservationLevel];
export const ScoreSource = {
  ANNOTATION: "ANNOTATION",
  API: "API",
  EVAL: "EVAL",
} as const;
export type ScoreSourceType = (typeof ScoreSource)[keyof typeof ScoreSource];

export type Observation = {
  id: string;
  traceId: string | null;
  projectId: string;
  environment: string;
  type: ObservationType;
  startTime: Date;
  endTime: Date | null;
  name: string | null;
  metadata: Prisma.JsonValue | null;
  parentObservationId: string | null;
  level: ObservationLevelType;
  statusMessage: string | null;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
  model: string | null;
  internalModel: string | null;
  internalModelId: string | null;
  modelParameters: unknown | null;
  input: unknown | null;
  output: unknown | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unit: string | null;
  inputCost: Decimal | null;
  outputCost: Decimal | null;
  totalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  calculatedTotalCost: Decimal | null;
  completionStartTime: Date | null;
  promptId: string | null;
};

export type ObservationView = {
  id: string;
  traceId: string | null;
  projectId: string;
  type: ObservationType;
  startTime: Date;
  endTime: Date | null;
  environment: string;
  name: string | null;
  metadata: Prisma.JsonValue | null;
  parentObservationId: string | null;
  level: ObservationLevelType;
  statusMessage: string | null;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
  model: string | null;
  modelParameters: unknown | null;
  input: unknown | null;
  output: unknown | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unit: string | null;
  completionStartTime: Date | null;
  promptId: string | null;
  promptName: string | null;
  promptVersion: number | null;
  modelId: string | null;
  inputPrice: Decimal | null;
  outputPrice: Decimal | null;
  totalPrice: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  calculatedTotalCost: Decimal | null;
  latency: number | null;
  timeToFirstToken: number | null;
};

export type Score = {
  id: string;
  timestamp: Date;
  projectId: string;
  environment: string;
  name: string;
  value: number | null;
  source: ScoreSourceType;
  authorUserId: string | null;
  comment: string | null;
  traceId: string;
  observationId: string | null;
  configId: string | null;
  stringValue: string | null;
  queueId: string | null;
  createdAt: Date;
  updatedAt: Date;
  dataType: ScoreDataType;
};

export type Trace = {
  id: string;
  timestamp: Date;
  name: string | null;
  userId: string | null;
  environment: string;
  metadata: Prisma.JsonValue | null;
  release: string | null;
  version: string | null;
  projectId: string;
  public: boolean;
  bookmarked: boolean;
  tags: string[];
  input: unknown | null;
  output: unknown | null;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  externalId: string | null;
};
