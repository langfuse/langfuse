import z from "zod";
import { orderBy, singleFilter } from "../../..";

export const CreateSavedViewInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "View name is required"),
  tableName: z.string(),
  filters: z.array(singleFilter),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  searchQuery: z.string().optional(),
  orderBy: orderBy,
});

export const UpdateSavedViewInput = CreateSavedViewInput.extend({
  id: z.string(),
});

export const UpdateSavedViewNameInput = z.object({
  id: z.string(),
  name: z.string(),
  tableName: z.string(),
  projectId: z.string(),
});

export type CreateSavedViewInput = z.infer<typeof CreateSavedViewInput>;
export type UpdateSavedViewInput = z.infer<typeof UpdateSavedViewInput>;
export type UpdateSavedViewNameInput = z.infer<typeof UpdateSavedViewNameInput>;

export const SavedViewDomainSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  name: z.string(),
  tableName: z.string(),
  filters: z.array(singleFilter),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  searchQuery: z.string().optional(),
  orderBy: orderBy,
});

export const SavedViewNamesCreatorListSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    createdBy: z.string(),
    createdByUser: z.object({
      image: z.string(),
    }),
  }),
);

export type SavedViewDomain = z.infer<typeof SavedViewDomainSchema>;
export type SavedViewNamesCreatorList = z.infer<
  typeof SavedViewNamesCreatorListSchema
>;
