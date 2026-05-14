import { StringNoHTML } from "@langfuse/shared";
import * as z from "zod";

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
