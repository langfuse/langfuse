import { z } from "zod";

export const evalModels = z.union([
  z.literal("gpt-3.5-turbo"),
  z.literal("gpt-4"),
]);

export const evalModelList = evalModels._def.options.map(
  (option) => option.value,
);

export const jobTypes = ["evaluations"] as const;

export enum JobTypes {
  Evaluation = "evaluation",
}

export enum EvalTargetObject {
  Trace = "trace",
}

export const DEFAULT_TRACE_JOB_DELAY = 10_000;
