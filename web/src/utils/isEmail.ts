import { z } from "zod/v4";

const emailSchema = z.email();

export const isEmail = (text: string) => emailSchema.safeParse(text).success;
