import { StringNoHTML } from "@langfuse/shared";
import * as z from "zod/v4";

const organizationTypeOptions = [
  "Personal",
  "Educational",
  "Company",
  "Startup",
  "Agency",
  "N/A",
] as const;

const organizationSizeOptions = [
  "1-10",
  "10-49",
  "50-99",
  "100-299",
  "More than 300",
] as const;

const organizationName = StringNoHTML.min(
  3,
  "Must have at least 3 characters",
).max(60, "Must have at most 60 characters");

// Base schema for org creation, used for server-side validation too
export const organizationNameSchema = z.object({
  name: organizationName,
});

export const organizationOptionalNameSchema = z.object({
  name: organizationName.optional(),
});

// Extended schema for client-side form validation including type and size,
// which are posted separately as a survey response.
export const organizationFormSchema = organizationNameSchema
  .extend({
    type: z.enum(organizationTypeOptions),
    size: z.enum(organizationSizeOptions).optional(),
  })
  .check((ctx) => {
    const { type, size } = ctx.value;
    if ((type === "Company" || type === "Agency") && !size) {
      ctx.issues.push({
        code: z.ZodIssueCode.custom,
        path: ["size"],
        input: ctx.value.size,
        message: "Please specify the size of your organization",
      });
    }
  });
