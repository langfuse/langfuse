import * as z from "zod";
import { StringNoHTML } from "@langfuse/shared";

export const projectNameSchema = z.object({
  name: StringNoHTML.min(3, "Must have at least 3 characters").max(
    60,
    "Must have at most 60 characters",
  ),
});

export const createProjectNameSchema = (messages: {
  noHtml: string;
  minLength: string;
  maxLength: string;
}) =>
  z.object({
    name: z
      .string()
      .refine((value) => StringNoHTML.safeParse(value).success, messages.noHtml)
      .min(3, messages.minLength)
      .max(60, messages.maxLength),
  });
