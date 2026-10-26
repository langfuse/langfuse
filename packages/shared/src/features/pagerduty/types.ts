import { PagerDutyRegion as PrismaPagerDutyRegion } from "@prisma/client";
import { z } from "zod";

/** PagerDutyRegionSchema is the service region of a PagerDuty account; it picks the Events API host. */
export const PagerDutyRegionSchema = z.enum(PrismaPagerDutyRegion);

export const PagerDutyIntegrationNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters");

/**
 * PagerDutyRoutingKeySchema accepts an Events API v2 routing key: a service
 * integration key or an Event Orchestration key. PagerDuty issues both as 32
 * alphanumeric characters.
 */
export const PagerDutyRoutingKeySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{32}$/,
    "Routing key must be the 32-character integration key from PagerDuty",
  );

/** PagerDutyIntegrationListItem is the client-safe view of a stored routing key. */
export type PagerDutyIntegrationListItem = {
  id: string;
  name: string;
  displayRoutingKey: string;
  region: PrismaPagerDutyRegion;
};

/** maskPagerDutyRoutingKey keeps the first and last four characters, e.g. `R0ab...9xYz`. */
export function maskPagerDutyRoutingKey(routingKey: string): string {
  if (routingKey.length <= 8) return "...";
  return `${routingKey.slice(0, 4)}...${routingKey.slice(-4)}`;
}
