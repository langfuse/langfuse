import z from "zod";
import {
  orderBy,
  singleFilter,
  SystemTableViewPresetCategory,
  TableViewPresetTableName,
} from "../../..";

export const CreateTableViewPresetsInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "View name is required"),
  tableName: z.enum(TableViewPresetTableName),
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
  tableName: z.enum(TableViewPresetTableName),
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
    tableName: z.enum(TableViewPresetTableName),
    description: z.string().optional(),
    isSystem: z.boolean().optional(),
    // Present on categorized system presets that surface as quick-access chips
    // beneath the search bar; undefined for user views and uncategorized presets.
    category: z.enum(SystemTableViewPresetCategory).optional(),
    createdBy: z.string().nullable(),
    createdByUser: z
      .object({
        image: z.string().nullish(),
        name: z.string().nullish(),
      })
      .nullish(),
    filters: z.array(singleFilter),
    columnOrder: z.array(z.string()),
    columnVisibility: z.record(z.string(), z.boolean()),
    searchQuery: z.string().nullish(),
    orderBy: orderBy,
  }),
);

export type TableViewPresetsNamesCreatorList = z.infer<
  typeof TableViewPresetsNamesCreatorListSchema
>;
