import {
  Bell,
  Database,
  Gauge,
  History,
  type IconComponent,
  ListChecks,
  Users,
} from "@langfuse/icons";

import { type PlanLimitKind } from "@/src/ee/features/billing/constants/pricingPlans";

/** The icon beside a plan limit's label. */
export const planLimitIcons: Record<PlanLimitKind, IconComponent> = {
  units: Database,
  "data-access": History,
  users: Users,
  "annotation-queues": ListChecks,
  alerts: Bell,
  ingestion: Gauge,
};
