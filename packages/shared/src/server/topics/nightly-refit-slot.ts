import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;
// Projects refit at a stable offset within this many minutes after the hour.
const REFIT_SPREAD_MINUTES = 30;

/**
 * The latest daily refit time at or before `now`: the configured UTC hour plus
 * a stable per-project offset within the spread window, so projects in one
 * deployment do not all refit at the same moment.
 */
export function nightlyRefitSlot(
  projectId: string,
  now: Date,
  hourUtc: number,
): Date {
  const offsetMinutes =
    createHash("sha256").update(projectId).digest().readUInt32BE(0) %
    REFIT_SPREAD_MINUTES;
  let slot =
    Math.floor(now.getTime() / DAY_MS) * DAY_MS +
    hourUtc * 3_600_000 +
    offsetMinutes * 60_000;
  while (slot > now.getTime()) slot -= DAY_MS;
  return new Date(slot);
}

/** The first daily refit time after `now`. */
export function nextNightlyRefitSlot(
  projectId: string,
  now: Date,
  hourUtc: number,
): Date {
  return new Date(nightlyRefitSlot(projectId, now, hourUtc).getTime() + DAY_MS);
}
