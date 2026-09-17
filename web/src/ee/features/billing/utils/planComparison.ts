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
    : `${formatCount(ingestion.value)} ingestion requests/min`;

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
      return "Support SLA";
  }
};

const formatDataRetention = (access: DataAccess) =>
  `${formatDataAccess(access)} of data retention`;

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

export const planChoiceReason = (
  displayTier: DisplayPlanTier,
  teamsAddonOn = false,
): string | null => {
  if (displayTier === "hobby") {
    return null;
  }

  const reasonTier: Exclude<PlanTier, "hobby"> =
    displayTier === "pro" && teamsAddonOn ? "team" : displayTier;

  return checkoutProductForTier(reasonTier)?.checkout?.description ?? null;
};

export const VOLUME_DISCOUNT_NOTE =
  "*price per 100k drops with increasing usage";

const ENTERPRISE_VALUE_LEAD = [
  "Negotiated usage on yearly terms",
  "Support SLA",
  "Uptime SLA",
  "Named lead support engineer",
] as const;

export const checkoutProductForTier = (tier: Exclude<PlanTier, "hobby">) =>
  stripeProducts.find((product) => product.mappedPlan === TIER_TO_PLAN[tier]);

const parseLeadingDollarAmount = (price: string) => {
  const match = price.replace(/,/g, "").match(/\$(\d+)/);
  return match ? Number(match[1]) : null;
};

export const teamsAddonPriceLabel = () => {
  const pro = checkoutProductForTier("pro")?.checkout?.price;
  const team = checkoutProductForTier("team")?.checkout?.price;
  if (!pro || !team) return "+$300/mo";
  const proAmount = parseLeadingDollarAmount(pro);
  const teamAmount = parseLeadingDollarAmount(team);
  if (proAmount === null || teamAmount === null) return "+$300/mo";
  return `+$${teamAmount - proAmount}/mo`;
};

const additionalCapabilityLines = (limits: PlanLimits): string[] => {
  const lines: string[] = [];
  if (limits.dataRetentionManagement) {
    lines.push("Data retention management");
  }
  if (limits.complianceReports) {
    lines.push("SOC2 Type II & ISO27001 reports, HIPAA-ready region");
  }
  if (limits.enterpriseSso || limits.fineGrainedRbac) {
    lines.push("Enterprise SSO and fine-grained RBAC");
  }
  if (limits.auditLogs || limits.scim) {
    lines.push("Audit logs and SCIM provisioning");
  }
  if (limits.uptimeSla) {
    lines.push("Uptime SLA");
  }
  if (limits.namedSupportEngineer) {
    lines.push("Named lead support engineer");
  }
  return lines;
};

const currentHeadlines = (tier: PlanTier): PlanComparisonLine[] => {
  const limits = LIMITS[tier];
  return [
    { polarity: "neutral", text: formatDataRetention(limits.dataAccess) },
    { polarity: "neutral", text: formatUsers(limits.users) },
    { polarity: "neutral", text: formatIngestion(limits.ingestion) },
    { polarity: "neutral", text: `${limits.alerts} alerts` },
    { polarity: "neutral", text: formatQueues(limits.annotationQueues) },
    { polarity: "neutral", text: formatSupport(limits.support) },
    ...additionalCapabilityLines(limits).map((text) => ({
      polarity: "neutral" as const,
      text,
    })),
  ];
};

const hobbyLossFromPaid = (
  current: PlanLimits,
  memberCount?: number,
): PlanComparisonLine[] => {
  const lines: PlanComparisonLine[] = [
    { polarity: "minus", text: formatDataRetention(LIMITS.hobby.dataAccess) },
  ];

  if (typeof memberCount === "number" && memberCount > 2) {
    lines.push({
      polarity: "minus",
      text: `2 users — ${memberCount - 2} of your ${memberCount} lose access`,
    });
  } else {
    lines.push({ polarity: "minus", text: formatUsers(LIMITS.hobby.users) });
  }

  if (current.usageModel !== "capped") {
    lines.push({
      polarity: "minus",
      text: "Usage capped at included units",
    });
  }

  lines.push({
    polarity: "minus",
    text: formatIngestion(LIMITS.hobby.ingestion),
  });
  lines.push({ polarity: "minus", text: `${LIMITS.hobby.alerts} alerts` });
  lines.push({
    polarity: "minus",
    text: formatQueues(LIMITS.hobby.annotationQueues),
  });

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

const dataAccessChanged = (from: DataAccess, to: DataAccess) =>
  from.kind !== to.kind ||
  (from.kind === "days" && to.kind === "days" && from.days !== to.days) ||
  (from.kind === "years" && to.kind === "years" && from.years !== to.years);

const capabilityDiff = (
  from: PlanLimits,
  to: PlanLimits,
  polarity: "plus" | "minus",
  memberCount?: number,
): PlanComparisonLine[] => {
  const lines: PlanComparisonLine[] = [];

  if (dataAccessChanged(from.dataAccess, to.dataAccess)) {
    lines.push({ polarity, text: formatDataRetention(to.dataAccess) });
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
        text: "Usage capped at included units",
      });
    } else if (to.usageModel === "negotiated") {
      lines.push({
        polarity,
        text: "Negotiated usage on yearly terms",
      });
    }
  }

  const ingestionChanged =
    from.ingestion.kind !== to.ingestion.kind ||
    (from.ingestion.kind === "fixed" &&
      to.ingestion.kind === "fixed" &&
      from.ingestion.value !== to.ingestion.value);
  if (ingestionChanged) {
    lines.push({ polarity, text: formatIngestion(to.ingestion) });
  }

  if (from.alerts !== to.alerts) {
    lines.push({ polarity, text: `${to.alerts} alerts` });
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
  const ingestionAlreadyStatesCustomRate =
    to.ingestion.kind === "custom" || from.ingestion.kind === "custom";
  pushChanged(
    lines,
    polarity,
    !ingestionAlreadyStatesCustomRate &&
      from.customRateLimits !== to.customRateLimits,
    "Custom rate limits",
  );
  pushChanged(lines, polarity, from.uptimeSla !== to.uptimeSla, "Uptime SLA");
  pushChanged(
    lines,
    polarity,
    from.namedSupportEngineer !== to.namedSupportEngineer,
    "Named lead support engineer",
  );

  return lines;
};

const ENTERPRISE_VALUE_LEAD_INDEX = new Map<string, number>(
  ENTERPRISE_VALUE_LEAD.map((text, index) => [text, index]),
);

const leadWithEnterpriseValue = (
  lines: PlanComparisonLine[],
): PlanComparisonLine[] => {
  const lead: PlanComparisonLine[] = [];
  const rest: PlanComparisonLine[] = [];

  for (const line of lines) {
    if (ENTERPRISE_VALUE_LEAD_INDEX.has(line.text)) {
      lead.push(line);
    } else {
      rest.push(line);
    }
  }

  lead.sort(
    (left, right) =>
      (ENTERPRISE_VALUE_LEAD_INDEX.get(left.text) ?? 0) -
      (ENTERPRISE_VALUE_LEAD_INDEX.get(right.text) ?? 0),
  );

  return [...lead, ...rest];
};

export const additiveUpgradeFrom = (
  displayTier: DisplayPlanTier,
): PlanTier | null => {
  switch (displayTier) {
    case "hobby":
      return null;
    case "core":
      return "hobby";
    case "pro":
      return "core";
    case "enterprise":
      return "team";
  }
};

export const getDisplayPlanComparison = ({
  currentTier,
  displayTier,
  teamsAddonOn,
  memberCount,
}: {
  currentTier: PlanTier;
  displayTier: DisplayPlanTier;
  teamsAddonOn: boolean;
  memberCount?: number;
}): PlanComparison => {
  const targetTier: PlanTier =
    displayTier === "pro" && teamsAddonOn ? "team" : displayTier;
  const listTier: PlanTier = displayTier === "pro" ? "pro" : displayTier;

  if (currentTier === targetTier) {
    return getPlanComparison({
      currentTier,
      targetTier: currentTier,
    });
  }

  return getPlanComparison({
    currentTier,
    targetTier: listTier,
    memberCount,
    upgradeFrom: additiveUpgradeFrom(displayTier) ?? undefined,
  });
};

export const teamsAddonBenefitLines = () =>
  capabilityDiff(LIMITS.pro, LIMITS.team, "plus").map((line) => line.text);

export const includingTeamsPriceLabel = () => {
  const team =
    checkoutProductForTier("team")?.checkout?.price ?? "$499 / month";
  return `${team.replace(" / month", "/month")} incl. Teams`;
};

export const getPlanComparison = ({
  currentTier,
  targetTier,
  memberCount,
  upgradeFrom,
}: {
  currentTier: PlanTier;
  targetTier: PlanTier;
  memberCount?: number;
  upgradeFrom?: PlanTier;
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
    const from = upgradeFrom ?? currentTier;
    const lines = capabilityDiff(
      LIMITS[from],
      targetLimits,
      "plus",
      memberCount,
    );
    return {
      heading: `Everything in ${planTierLabel(from)}, plus`,
      lines:
        targetTier === "enterprise" ? leadWithEnterpriseValue(lines) : lines,
    };
  }

  return {
    heading: `What you lose from ${planTierLabel(currentTier)}`,
    lines: capabilityDiff(currentLimits, targetLimits, "minus", memberCount),
  };
};
