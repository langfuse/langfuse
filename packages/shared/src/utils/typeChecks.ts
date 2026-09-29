import { z } from "zod";

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined && value !== "";

export function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}

export const stringDateTime = z.iso.datetime({ offset: true }).nullish();
