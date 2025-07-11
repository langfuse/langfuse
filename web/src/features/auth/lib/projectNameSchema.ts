import * as z from "zod/v4";
import { StringNoHTMLNonEmpty } from "@langfuse/shared";

export const projectNameSchema = z.object({
  name: StringNoHTMLNonEmpty.min(3, "Must have at least 3 characters").max(
    60,
    "Must have at most 60 characters",
  ),
});
