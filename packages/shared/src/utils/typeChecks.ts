import { z } from "zod";

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined && value !== "";

export function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}

export const stringDateTime = z.iso.datetime({ offset: true }).nullish();

const ISO_DATETIME_OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;

/** Appends `Z` to an ISO datetime without an offset so it parses as UTC, independent of the server time zone */
export const withUtcOffsetIfMissing = (value: string): string =>
  ISO_DATETIME_OFFSET_SUFFIX.test(value) ? value : `${value}Z`;

/** ISO datetime that accepts a missing offset and normalizes it to UTC */
export const utcDefaultStringDateTime = z.iso
  .datetime({ offset: true, local: true })
  .transform(withUtcOffsetIfMissing)
  .nullish();
