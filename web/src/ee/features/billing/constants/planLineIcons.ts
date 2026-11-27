import {
  Activity,
  Archive,
  CalendarClock,
  FileCheck,
  Headset,
  type IconComponent,
  KeyRound,
  Layers,
  LifeBuoy,
  Lock,
  Network,
  ScrollText,
  Shield,
  Tag,
  UserCog,
  Users,
} from "@langfuse/icons";

import { type PlanLineKind } from "@/src/ee/features/billing/constants/pricingPlans";

/** The icon beside a plan's feature line. */
export const planLineIcons: Record<PlanLineKind, IconComponent> = {
  platform: Layers,
  support: Headset,
  "data-retention": Archive,
  compliance: FileCheck,
  hipaa: Shield,
  sso: KeyRound,
  "sso-enforcement": Lock,
  rbac: Users,
  "protected-labels": Tag,
  "blob-export": CalendarClock,
  "audit-logs": ScrollText,
  scim: UserCog,
  "uptime-sla": Activity,
  "support-sla": LifeBuoy,
  "private-link": Network,
};
