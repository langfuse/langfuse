import { z } from "zod/v4";

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined && value !== "";

export const stringDateTime = z.string().datetime({ offset: true }).nullish();
