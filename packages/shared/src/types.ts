import { type z } from "zod/v4";
import { singleFilter, timeFilter } from "./interfaces/filters";

// to be sent to the server
export type TimeFilter = z.infer<typeof timeFilter>;
export type FilterCondition = z.infer<typeof singleFilter>;
export type FilterState = FilterCondition[];

// to be used in the client during editing
type MakeOptional<T> = {
  [K in keyof T]?: T[K];
};
// if key is value, add string as value
type AllowStringAsValue<T> = {
  [K in keyof T]: K extends "value" ? string | T[K] : T[K];
};

export type WipFilterCondition = AllowStringAsValue<
  MakeOptional<FilterCondition>
>;
export type WipFilterState = WipFilterCondition[];

export type FilterOption = {
  value: string;
  count?: number;
  displayValue?: string; // FIX: Temporary workaround: Used to display a different value than the actual value since multiSelect doesn't support key-value pairs
  description?: string;
};

export type TableName =
  | "traces"
  | "generations"
  | "sessions"
  | "scores"
  | "prompts"
  | "dashboard"
  | "widgets"
  | "users"
  | "eval_configs"
  | "job_executions";
