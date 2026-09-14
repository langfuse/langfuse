import { type Plan } from "@langfuse/shared";

import {
  MAX_EVENTS_FREE_PLAN,
  PAID_PLAN_INCLUDED_UNITS,
} from "@/src/ee/features/billing/constants";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";

const PLAN_TIERS = ["hobby", "core", "pro", "team", "enterprise"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

export const DISPLAY_PLAN_TIERS = [
  "hobby",
  "core",
  "pro",
  "enterprise",
] as const;

export type DisplayPlanTier = (typeof DISPLAY_PLAN_TIERS)[number];

type ComparisonPolarity = "plus" | "minus" | "neutral";

type PlanComparisonLine = {
  polarity: ComparisonPolarity;
  text: string;
};

type PlanComparison = {
  heading: string;
  lines: PlanComparisonLine[];
};

const TIER_LABEL: Record<PlanTier, string> = {
  hobby: "Hobby",
  core: "Core",
  pro: "Pro",
  team: "Pro + Teams",
  enterprise: "Enterprise",
};

const PLAN_TO_TIER: Partial<Record<Plan, PlanTier>> = {
  "cloud:hobby": "hobby",
  "cloud:core": "core",
  "cloud:pro": "pro",
  "cloud:team": "team",
  "cloud:enterprise": "enterprise",
};

const TIER_TO_PLAN: Record<Exclude<PlanTier, "hobby">, Plan> = {
  core: "cloud:core",
  pro: "cloud:pro",
  team: "cloud:team",
  enterprise: "cloud:enterprise",
};

type DataAccess =
  | { kind: "days"; days: number }
  | { kind: "years"; years: number };

type UserLimit = { kind: "capped"; count: number } | { kind: "unlimited" };

type QueueLimit = { kind: "capped"; count: number } | { kind: "unlimited" };

type IngestionLimit = { kind: "fixed"; value: number } | { kind: "custom" };

type SupportLevel =
  | "community"
  | "in-app-48h"
  | "prioritized-48h"
  | "slack-24h"
  | "named-sla";

type UsageModel = "capped" | "usage-billed" | "negotiated";

type PlanLimits = {
  includedUnits: number;
  usageModel: UsageModel;
  dataAccess: DataAccess;
  users: UserLimit;
  ingestion: IngestionLimit;
  alerts: number;
  annotationQueues: QueueLimit;
  support: SupportLevel;
  dataRetentionManagement: boolean;
  complianceReports: boolean;
  enterpriseSso: boolean;
  fineGrainedRbac: boolean;
  auditLogs: boolean;
  scim: boolean;
  customRateLimits: boolean;
  uptimeSla: boolean;
  namedSupportEngineer: boolean;
};

const LIMITS: Record<PlanTier, PlanLimits> = {
  hobby: {
    includedUnits: MAX_EVENTS_FREE_PLAN,
    usageModel: "capped",
    dataAccess: { kind: "days", days: 30 },
    users: { kind: "capped", count: 2 },
    ingestion: { kind: "fixed", value: 1_000 },
    alerts: 2,
    annotationQueues: { kind: "capped", count: 1 },
    support: "community",
    dataRetentionManagement: false,
    complianceReports: false,
    enterpriseSso: false,
    fineGrainedRbac: false,
    auditLogs: false,
    scim: false,
    customRateLimits: false,
    uptimeSla: false,
    namedSupportEngineer: false,
  },
  core: {
    includedUnits: PAID_PLAN_INCLUDED_UNITS,
    usageModel: "usage-billed",
    dataAccess: { kind: "days", days: 90 },
    users: { kind: "unlimited" },
    ingestion: { kind: "fixed", value: 4_000 },
    alerts: 20,
    annotationQueues: { kind: "capped", count: 3 },
    support: "in-app-48h",
    dataRetentionManagement: false,
    complianceReports: false,
    enterpriseSso: false,
    fineGrainedRbac: false,
    auditLogs: false,
    scim: false,
    customRateLimits: false,
    uptimeSla: false,
    namedSupportEngineer: false,
  },
  pro: {
    includedUnits: PAID_PLAN_INCLUDED_UNITS,
    usageModel: "usage-billed",
    dataAccess: { kind: "years", years: 3 },
    users: { kind: "unlimited" },
    ingestion: { kind: "fixed", value: 20_000 },
    alerts: 50,
    annotationQueues: { kind: "unlimited" },
    support: "prioritized-48h",
    dataRetentionManagement: true,
    complianceReports: true,
    enterpriseSso: false,
    fineGrainedRbac: false,
    auditLogs: false,
    scim: false,
    customRateLimits: false,
    uptimeSla: false,
    namedSupportEngineer: false,
  },
  team: {
    includedUnits: PAID_PLAN_INCLUDED_UNITS,
    usageModel: "usage-billed",
    dataAccess: { kind: "years", years: 3 },
    users: { kind: "unlimited" },
    ingestion: { kind: "fixed", value: 20_000 },
    alerts: 50,
    annotationQueues: { kind: "unlimited" },
    support: "slack-24h",
    dataRetentionManagement: true,
    complianceReports: true,
    enterpriseSso: true,
    fineGrainedRbac: true,
    auditLogs: false,
    scim: false,
    customRateLimits: false,
    uptimeSla: false,
    namedSupportEngineer: false,
  },
  enterprise: {
    includedUnits: PAID_PLAN_INCLUDED_UNITS,
    usageModel: "negotiated",
    dataAccess: { kind: "years", years: 3 },
    users: { kind: "unlimited" },
    ingestion: { kind: "custom" },
    alerts: 100,
    annotationQueues: { kind: "unlimited" },
    support: "named-sla",
    dataRetentionManagement: true,
    complianceReports: true,
    enterpriseSso: true,
    fineGrainedRbac: true,
    auditLogs: true,
    scim: true,
    customRateLimits: true,
    uptimeSla: true,
    namedSupportEngineer: true,
  },
};

const formatCount = (value: number) => value.toLocaleString("en-US");

const formatDataAccess = (access: DataAccess) =>
  access.kind === "days" ? `${access.days} days` : `${access.years} years`;

const formatUsers = (users: UserLimit) =>
  users.kind === "unlimited" ? "Unlimited users" : `${users.count} users`;

const formatQueues = (queues: QueueLimit) =>
  queues.kind === "unlimited"
    ? "Unlimited annotation queues"
    : `${queues.count} annotation queue${queues.count === 1 ? "" : "s"}`;

const formatIngestion = (ingestion: IngestionLimit) =>
  ingestion.kind === "custom"
    ? "Custom rate limits"
    : `${formatCount(ingestion.value)} req/min ingestion`;

const formatSupport = (support: SupportLevel) => {
  switch (support) {
    case "community":
      return "Community support via GitHub";
    case "in-app-48h":
      return "In-app support, 48h response";
    case "prioritized-48h":
      return "Prioritized in-app support";
    case "slack-24h":
      return "Private Slack channel, 24h response";
    case "named-sla":
      return "Named lead support engineer and support SLA";
  }
};

const formatUsage = (limits: PlanLimits) => {
  const included = `${formatCount(limits.includedUnits)} units included`;
  if (limits.usageModel === "capped") {
    return `${included}, no additional usage — capped`;
  }
  if (limits.usageModel === "negotiated") {
    return `${included}, then $8 / 100k, negotiated on yearly terms`;
  }
  return `${included}, then $8 / 100k, lower with increasing usage`;
};

export const planTierLabel = (tier: PlanTier) => TIER_LABEL[tier];

export const planTierFromPlan = (plan: Plan | undefined): PlanTier =>
  (plan && PLAN_TO_TIER[plan]) || "hobby";

const comparePlanTiers = (left: PlanTier, right: PlanTier) =>
  PLAN_TIERS.indexOf(left) - PLAN_TIERS.indexOf(right);

export const suggestedUpgradeTier = (current: PlanTier): PlanTier | null => {
  switch (current) {
    case "hobby":
      return "core";
    case "core":
      return "pro";
    case "pro":
    case "team":
      return "enterprise";
    case "enterprise":
      return null;
  }
};

export const includedUnitsForTier = (tier: PlanTier) =>
  LIMITS[tier].includedUnits;

export const dataAccessLabelForTier = (tier: PlanTier) =>
  formatDataAccess(LIMITS[tier].dataAccess);

export const usersLabelForTier = (tier: PlanTier, memberCount?: number) => {
  if (typeof memberCount === "number") {
    return `${memberCount} user${memberCount === 1 ? "" : "s"}`;
  }
  return formatUsers(LIMITS[tier].users);
};

export const checkoutProductForTier = (tier: Exclude<PlanTier, "hobby">) =>
  stripeProducts.find((product) => product.mappedPlan === TIER_TO_PLAN[tier]);

const parseLeadingDollarAmount = (price: string) => {
  const match = price.replace(/,/g, "").match(/\$(\d+)/);
  return match ? Number(match[1]) : null;
};

export const teamsAddonPriceLabel = () => {
  const pro = checkoutProductForTier("pro")?.checkout?.price;
  const team = checkoutProductForTier("team")?.checkout?.price;
  if (!pro || !team) return "+$300 / month";
  const proAmount = parseLeadingDollarAmount(pro);
  const teamAmount = parseLeadingDollarAmount(team);
  if (proAmount === null || teamAmount === null) return "+$300 / month";
  return `+$${teamAmount - proAmount} / month`;
};

const currentHeadlines = (tier: PlanTier): PlanComparisonLine[] => {
  const limits = LIMITS[tier];
  const lines: PlanComparisonLine[] = [
    { polarity: "neutral", text: formatUsage(limits) },
    {
      polarity: "neutral",
      text: `${formatDataAccess(limits.dataAccess)} of history`,
    },
    { polarity: "neutral", text: formatUsers(limits.users) },
  ];

  if (limits.ingestion.kind === "fixed") {
    lines.push({
      polarity: "neutral",
      text: `${formatIngestion(limits.ingestion)}, ${limits.alerts} alerts`,
    });
  } else {
    lines.push({
      polarity: "neutral",
      text: `${formatIngestion(limits.ingestion)}, ${limits.alerts} alerts`,
    });
  }

  lines.push({
    polarity: "neutral",
    text: formatQueues(limits.annotationQueues),
  });
  lines.push({ polarity: "neutral", text: formatSupport(limits.support) });

  if (limits.dataRetentionManagement) {
    lines.push({ polarity: "neutral", text: "Data retention management" });
  }
  if (limits.complianceReports) {
    lines.push({
      polarity: "neutral",
      text: "SOC2 Type II & ISO27001 reports, HIPAA-ready region",
    });
  }
  if (limits.enterpriseSso) {
    lines.push({
      polarity: "neutral",
      text: "Enterprise SSO and fine-grained RBAC",
    });
  }
  if (limits.auditLogs || limits.scim) {
    lines.push({
      polarity: "neutral",
      text: "Audit logs and SCIM provisioning",
    });
  }
  if (limits.uptimeSla) {
    lines.push({ polarity: "neutral", text: "Uptime SLA and support SLA" });
  }
  if (limits.namedSupportEngineer) {
    lines.push({ polarity: "neutral", text: "Named lead support engineer" });
  }

  return lines;
};

const hobbyLossFromPaid = (
  current: PlanLimits,
  memberCount?: number,
): PlanComparisonLine[] => {
  const lines: PlanComparisonLine[] = [];

  if (current.dataAccess.kind === "days") {
    lines.push({
      polarity: "minus",
      text: `History drops to 30 days, from ${current.dataAccess.days}`,
    });
  } else {
    lines.push({
      polarity: "minus",
      text: `History drops to 30 days, from ${current.dataAccess.years} years`,
    });
  }

  if (typeof memberCount === "number" && memberCount > 2) {
    lines.push({
      polarity: "minus",
      text: `2 users — ${memberCount - 2} of your ${memberCount} lose access`,
    });
  } else {
    lines.push({ polarity: "minus", text: "2 users" });
  }

  if (current.usageModel !== "capped") {
    lines.push({
      polarity: "minus",
      text: `Ingestion stops at ${formatCount(MAX_EVENTS_FREE_PLAN)} units instead of being billed`,
    });
  }

  if (current.ingestion.kind === "fixed") {
    lines.push({
      polarity: "minus",
      text: `Ingestion throughput drops to 1,000 req/min, 2 alerts`,
    });
  }

  if (current.support !== "community") {
    lines.push({ polarity: "minus", text: "No in-app support" });
  }

  return lines;
};

const pushChanged = (
  lines: PlanComparisonLine[],
  polarity: "plus" | "minus",
  changed: boolean,
  text: string,
) => {
  if (changed) {
    lines.push({ polarity, text });
  }
};

const capabilityDiff = (
  from: PlanLimits,
  to: PlanLimits,
  polarity: "plus" | "minus",
  memberCount?: number,
): PlanComparisonLine[] => {
  const lines: PlanComparisonLine[] = [];

  if (
    from.dataAccess.kind !== to.dataAccess.kind ||
    (from.dataAccess.kind === "days" &&
      to.dataAccess.kind === "days" &&
      from.dataAccess.days !== to.dataAccess.days) ||
    (from.dataAccess.kind === "years" &&
      to.dataAccess.kind === "years" &&
      from.dataAccess.years !== to.dataAccess.years)
  ) {
    if (polarity === "plus") {
      lines.push({
        polarity,
        text: `${formatDataAccess(to.dataAccess)} of history, up from ${formatDataAccess(from.dataAccess)}`,
      });
    } else {
      lines.push({
        polarity,
        text: `History drops to ${formatDataAccess(to.dataAccess)}, from ${formatDataAccess(from.dataAccess)}`,
      });
    }
  }

  if (from.users.kind !== to.users.kind) {
    if (to.users.kind === "capped") {
      if (typeof memberCount === "number" && memberCount > to.users.count) {
        lines.push({
          polarity,
          text: `${to.users.count} users — ${memberCount - to.users.count} of your ${memberCount} lose access`,
        });
      } else {
        lines.push({ polarity, text: formatUsers(to.users) });
      }
    } else {
      lines.push({ polarity, text: formatUsers(to.users) });
    }
  }

  if (
    from.usageModel !== to.usageModel ||
    from.includedUnits !== to.includedUnits
  ) {
    if (to.usageModel === "capped") {
      lines.push({
        polarity,
        text: `Ingestion stops at ${formatCount(to.includedUnits)} units instead of being billed`,
      });
    } else if (from.usageModel === "capped") {
      lines.push({
        polarity,
        text: `${formatCount(to.includedUnits)} units included, then billed instead of a ${formatCount(from.includedUnits)} cap`,
      });
    } else if (to.usageModel === "negotiated") {
      lines.push({
        polarity,
        text: "Negotiated usage rate on yearly terms",
      });
    } else if (from.usageModel === "negotiated") {
      lines.push({
        polarity,
        text: `${formatCount(to.includedUnits)} units included, then $8 / 100k, lower with increasing usage`,
      });
    }
  }

  const ingestionChanged =
    from.ingestion.kind !== to.ingestion.kind ||
    (from.ingestion.kind === "fixed" &&
      to.ingestion.kind === "fixed" &&
      from.ingestion.value !== to.ingestion.value);
  const alertsChanged = from.alerts !== to.alerts;

  if (ingestionChanged && alertsChanged && to.ingestion.kind === "fixed") {
    lines.push({
      polarity,
      text:
        polarity === "plus"
          ? `${formatIngestion(to.ingestion)}, up from ${from.ingestion.kind === "fixed" ? formatCount(from.ingestion.value) : "custom"}, ${to.alerts} alerts`
          : `${formatIngestion(to.ingestion)}, ${to.alerts} alerts`,
    });
  } else {
    if (ingestionChanged) {
      lines.push({
        polarity,
        text:
          polarity === "plus" &&
          to.ingestion.kind === "fixed" &&
          from.ingestion.kind === "fixed"
            ? `${formatIngestion(to.ingestion)}, up from ${formatCount(from.ingestion.value)}`
            : formatIngestion(to.ingestion),
      });
    }
    if (alertsChanged) {
      lines.push({ polarity, text: `${to.alerts} alerts` });
    }
  }

  if (
    from.annotationQueues.kind !== to.annotationQueues.kind ||
    (from.annotationQueues.kind === "capped" &&
      to.annotationQueues.kind === "capped" &&
      from.annotationQueues.count !== to.annotationQueues.count)
  ) {
    lines.push({ polarity, text: formatQueues(to.annotationQueues) });
  }

  if (from.support !== to.support) {
    if (polarity === "minus" && to.support === "community") {
      lines.push({ polarity, text: "No in-app support" });
    } else {
      lines.push({ polarity, text: formatSupport(to.support) });
    }
  }

  pushChanged(
    lines,
    polarity,
    from.dataRetentionManagement !== to.dataRetentionManagement,
    "Data retention management",
  );
  pushChanged(
    lines,
    polarity,
    from.complianceReports !== to.complianceReports,
    "SOC2 Type II & ISO27001 reports, HIPAA-ready region",
  );
  pushChanged(
    lines,
    polarity,
    from.enterpriseSso !== to.enterpriseSso ||
      from.fineGrainedRbac !== to.fineGrainedRbac,
    "Enterprise SSO and fine-grained RBAC",
  );
  pushChanged(
    lines,
    polarity,
    from.auditLogs !== to.auditLogs || from.scim !== to.scim,
    "Audit logs and SCIM provisioning",
  );
  pushChanged(
    lines,
    polarity,
    from.customRateLimits !== to.customRateLimits,
    "Custom rate limits",
  );
  pushChanged(
    lines,
    polarity,
    from.uptimeSla !== to.uptimeSla,
    "Uptime SLA and support SLA",
  );
  pushChanged(
    lines,
    polarity,
    from.namedSupportEngineer !== to.namedSupportEngineer,
    "Named lead support engineer",
  );

  return lines;
};

export const getPlanComparison = ({
  currentTier,
  targetTier,
  memberCount,
}: {
  currentTier: PlanTier;
  targetTier: PlanTier;
  memberCount?: number;
}): PlanComparison => {
  if (currentTier === targetTier) {
    return {
      heading: "What you have today",
      lines: currentHeadlines(targetTier),
    };
  }

  const currentLimits = LIMITS[currentTier];
  const targetLimits = LIMITS[targetTier];
  const isUpgrade = comparePlanTiers(targetTier, currentTier) > 0;

  if (!isUpgrade && targetTier === "hobby") {
    return {
      heading: `What you lose from ${planTierLabel(currentTier)}`,
      lines: hobbyLossFromPaid(currentLimits, memberCount),
    };
  }

  if (isUpgrade) {
    return {
      heading: `What you gain over ${planTierLabel(currentTier)}`,
      lines: capabilityDiff(currentLimits, targetLimits, "plus", memberCount),
    };
  }

  return {
    heading: `What you lose from ${planTierLabel(currentTier)}`,
    lines: capabilityDiff(currentLimits, targetLimits, "minus", memberCount),
  };
};
