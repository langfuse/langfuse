import { z } from "zod/v4";

const emailSchema = z.email();

export function isEmailAddress(value: string) {
  return emailSchema.safeParse(value).success;
}
