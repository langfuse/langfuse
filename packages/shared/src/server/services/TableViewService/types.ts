import z from "zod/v4";
import { orderBy, singleFilter } from "../../..";

export const CreateTableViewPresetsInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "View name is required"),
  tableName: z.string(),
  filters: z.array(singleFilter),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  searchQuery: z.string().optional(),
  orderBy: orderBy,
});

export const UpdateTableViewPresetsInput = CreateTableViewPresetsInput.extend({
  id: z.string(),
});

export const UpdateTableViewPresetsNameInput = z.object({
  id: z.string(),
  name: z.string(),
  tableName: z.string(),
  projectId: z.string(),
});

export type CreateTableViewPresetsInput = z.infer<
  typeof CreateTableViewPresetsInput
>;
export type UpdateTableViewPresetsInput = z.infer<
  typeof UpdateTableViewPresetsInput
>;
export type UpdateTableViewPresetsNameInput = z.infer<
  typeof UpdateTableViewPresetsNameInput
>;

export const TableViewPresetsNamesCreatorListSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    createdBy: z.string(),
    createdByUser: z
      .object({
        image: z.string().nullish(),
        name: z.string().nullish(),
      })
      .nullish(),
  }),
);

export type TableViewPresetsNamesCreatorList = z.infer<
  typeof TableViewPresetsNamesCreatorListSchema
>;
