import { StringNoHTML } from "@langfuse/shared";
import * as z from "zod";

type OrganizationNameValidationMessages = {
  noHtml: string;
  minLength: string;
  maxLength: string;
};

const defaultValidationMessages: OrganizationNameValidationMessages = {
  noHtml: "Text cannot contain HTML tags",
  minLength: "Must have at least 3 characters",
  maxLength: "Must have at most 60 characters",
};

export const createOrganizationNameSchema = (
  messages: OrganizationNameValidationMessages = defaultValidationMessages,
) =>
  z
    .string()
    .refine((value) => StringNoHTML.safeParse(value).success, messages.noHtml)
    .min(3, messages.minLength)
    .max(60, messages.maxLength);

export const organizationNameSchema = createOrganizationNameSchema();

export const organizationFormSchema = z.object({
  name: organizationNameSchema,
  aiFeaturesEnabled: z.boolean(),
});

export const createOrganizationFormSchema = (
  messages: OrganizationNameValidationMessages,
) =>
  z.object({
    name: createOrganizationNameSchema(messages),
    aiFeaturesEnabled: z.boolean(),
  });

export const organizationOptionalNameSchema = z.object({
  name: organizationNameSchema.optional(),
});
