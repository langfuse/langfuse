import z from "zod";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { BatchTableNames } from "../../interfaces/tableNames";

/* eslint-disable no-unused-vars */
export enum BatchActionType {
  Create = "create",
  Delete = "delete",
}

const ActionIdSchema = z.enum([
  "score-delete",
  "trace-delete",
  "trace-add-to-annotation-queue",
]);

export type ActionId = z.infer<typeof ActionIdSchema>;

export const BatchActionQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

export type BatchActionQuery = z.infer<typeof BatchActionQuerySchema>;

export const CreateBatchActionSchema = z.object({
  projectId: z.string(),
  actionId: ActionIdSchema,
  targetId: z.string().optional(),
  query: BatchActionQuerySchema,
  tableName: z.nativeEnum(BatchTableNames),
});

export const GetIsBatchActionInProgressSchema = z.object({
  projectId: z.string(),
  actionId: ActionIdSchema,
  tableName: z.nativeEnum(BatchTableNames),
});
