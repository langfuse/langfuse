import { StringNoHTML } from "@langfuse/shared";
import * as z from "zod/v4";

export const organizationNameSchema = z.object({
  name: StringNoHTML.min(3, "Must have at least 3 characters").max(
    60,
    "Must have at most 60 characters",
  ),
});
