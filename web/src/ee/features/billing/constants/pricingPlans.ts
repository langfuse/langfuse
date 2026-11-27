/**
 * The Cloud plans: the one place with their names, prices, limits and feature
 * lines. Copied from the pricing page's comparison table, langfuse-docs
 * components/home/pricing/PricingTable.tsx at 23283366f (2026-11-25); the two
 * must change together. A limit here is never more generous than the one the
 * app enforces (pricingPlans.clienttest.ts).
 */
import { type Plan } from "@langfuse/shared";

export type CloudPlan = Extract<
  Plan,
  "cloud:hobby" | "cloud:core" | "cloud:pro" | "cloud:team" | "cloud:enterprise"
>;

/** Cheapest first; each plan includes everything in the one before it. */
export const cloudPlans = [
  "cloud:hobby",
  "cloud:core",
  "cloud:pro",
  "cloud:team",
  "cloud:enterprise",
] as const satisfies ReadonlyArray<CloudPlan>;

export type PlanLimitKind =
  | "units"
  | "data-access"
  | "users"
  | "annotation-queues"
  | "alerts"
  | "ingestion";

/** A count, or no limit, or a limit agreed per customer. */
export type PlanLimitValue = number | "unlimited" | "custom";

/** In the order the limits are shown. */
export const planLimitLabels: Record<PlanLimitKind, string> = {
  units: "Units a month",
  "data-access": "Data access",
  users: "Users",
  "annotation-queues": "Annotation queues",
  alerts: "Alerts",
  ingestion: "Ingestion per minute",
};

/** What a feature line is about; a plan's line replaces a lower plan's line of the same kind. */
export type PlanLineKind =
  | "platform"
  | "support"
  | "data-retention"
  | "compliance"
  | "hipaa"
  | "sso"
  | "sso-enforcement"
  | "rbac"
  | "protected-labels"
  | "blob-export"
  | "audit-logs"
  | "scim"
  | "uptime-sla"
  | "support-sla"
  | "private-link";

export type PlanLine = { kind: PlanLineKind; text: string };

export type PricingPlan = {
  name: string;
  /** Who the plan is for, in a few words. */
  tagline: string;
  description: string;
  /** Base fee in US dollars; usage is billed on top on paid plans. */
  monthlyPrice: number;
  /** Data access in days, ingestion in requests a minute, the rest as counts. */
  limits: Record<PlanLimitKind, PlanLimitValue>;
  /** What the plan adds on top of the plan below it. */
  lines: ReadonlyArray<PlanLine>;
};

const THREE_YEARS_IN_DAYS = 3 * 365;

export const pricingPlans: Record<CloudPlan, PricingPlan> = {
  "cloud:hobby": {
    name: "Hobby",
    tagline: "Side projects and trials",
    description:
      "Get started, no credit card required. Great for hobby projects and POCs.",
    monthlyPrice: 0,
    limits: {
      units: 50_000,
      "data-access": 30,
      users: 2,
      "annotation-queues": 1,
      alerts: 2,
      ingestion: 1_000,
    },
    lines: [
      { kind: "platform", text: "All platform features (with limits)" },
      { kind: "support", text: "Community support via GitHub" },
    ],
  },
  "cloud:core": {
    name: "Core",
    tagline: "Production projects",
    description:
      "For production projects. Longer data access and unlimited users.",
    monthlyPrice: 29,
    limits: {
      units: 100_000,
      "data-access": 90,
      users: "unlimited",
      "annotation-queues": 3,
      alerts: 20,
      ingestion: 4_000,
    },
    lines: [{ kind: "support", text: "In-app support" }],
  },
  "cloud:pro": {
    name: "Pro",
    tagline: "Scaling projects",
    description:
      "For scaling projects. 3 years of data access, higher rate limits and compliance reports.",
    monthlyPrice: 199,
    limits: {
      units: 100_000,
      "data-access": THREE_YEARS_IN_DAYS,
      users: "unlimited",
      "annotation-queues": "unlimited",
      alerts: 50,
      ingestion: 20_000,
    },
    lines: [
      { kind: "data-retention", text: "Data retention management" },
      { kind: "compliance", text: "SOC2 and ISO27001 reports" },
      { kind: "hipaa", text: "HIPAA-ready region" },
    ],
  },
  // The app's Team plan is Pro with the Teams add-on.
  "cloud:team": {
    name: "Pro + Teams Add-on",
    tagline: "Organizational and security controls",
    description: "Organizational and security controls for larger teams.",
    monthlyPrice: 499,
    limits: {
      units: 100_000,
      "data-access": THREE_YEARS_IN_DAYS,
      users: "unlimited",
      "annotation-queues": "unlimited",
      alerts: 50,
      ingestion: 20_000,
    },
    lines: [
      { kind: "sso", text: "Enterprise SSO (e.g. Okta)" },
      { kind: "sso-enforcement", text: "SSO enforcement" },
      { kind: "rbac", text: "Project-level RBAC" },
      { kind: "protected-labels", text: "Protected deployment labels" },
      { kind: "blob-export", text: "Scheduled export to blob storage" },
      { kind: "support", text: "Private Slack or MS Teams channel" },
    ],
  },
  "cloud:enterprise": {
    name: "Enterprise",
    tagline: "Large scale teams",
    description:
      "For large scale teams. Enterprise-grade support and security.",
    monthlyPrice: 2499,
    limits: {
      units: 100_000,
      "data-access": THREE_YEARS_IN_DAYS,
      users: "unlimited",
      "annotation-queues": "unlimited",
      alerts: 100,
      ingestion: "custom",
    },
    lines: [
      { kind: "audit-logs", text: "Audit logs" },
      { kind: "scim", text: "SCIM API" },
      { kind: "uptime-sla", text: "Uptime SLA" },
      { kind: "support-sla", text: "Support SLA" },
      { kind: "support", text: "Named lead support engineer" },
      { kind: "private-link", text: "AWS PrivateLink" },
    ],
  },
};
