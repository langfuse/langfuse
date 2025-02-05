import z from "zod";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { ACTION_ACCESS_MAP } from "./constants";

// TODO: merge type with batch export table name
export enum BulkActionTableName {
  Traces = "traces",
}

export type ActionId = keyof typeof ACTION_ACCESS_MAP;

export const BulkActionQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

export const CreateBulkActionSchema = z.object({
  projectId: z.string(),
  actionId: z
    .string()
    .refine(
      (val): val is ActionId => val in ACTION_ACCESS_MAP,
      "Invalid action ID",
    ),
  targetId: z.string().optional(),
  query: BulkActionQuerySchema,
  tableName: z.nativeEnum(BulkActionTableName),
});

export const GetIsBulkActionInProgressSchema = z.object({
  projectId: z.string(),
  tableName: z.nativeEnum(BulkActionTableName),
});
