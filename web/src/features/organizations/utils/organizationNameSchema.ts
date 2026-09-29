import { StringNoHTML } from "@langfuse/shared";
import * as z from "zod";

export const organizationNameSchema = StringNoHTML.min(
  3,
  "Must have at least 3 characters",
).max(60, "Must have at most 60 characters");

export const organizationFormSchema = z.object({
  name: organizationNameSchema,
  aiFeaturesEnabled: z.boolean(),
});

export const organizationOptionalNameSchema = z.object({
  name: organizationNameSchema.optional(),
});
