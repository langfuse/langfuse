import z from "zod";
import { orderBy, singleFilter } from "../../..";

export const CreateSavedViewInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Widget name is required"),
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

export type CreateSavedViewInput = z.infer<typeof CreateSavedViewInput>;
export type UpdateSavedViewInput = z.infer<typeof UpdateSavedViewInput>;

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

export type SavedViewDomain = z.infer<typeof SavedViewDomainSchema>;
