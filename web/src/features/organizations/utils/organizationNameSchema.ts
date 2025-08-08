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

export const organizationNameSchema = z.object({
  name: StringNoHTML.min(3, "Must have at least 3 characters").max(
    60,
    "Must have at most 60 characters",
  ),
  type: z.enum(organizationTypeOptions).optional(),
  size: z.enum(organizationSizeOptions).optional(),
});
