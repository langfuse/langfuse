import { type Plan, type Role } from "@langfuse/shared";
import { type ProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { type RouterOutputs } from "@/src/utils/api";
import { getIngestionStatus, type IngestionStatus } from "./getIngestionStatus";

/** From this share of the plan limit on, the organization is close to it. */
export const NEAR_LIMIT_RATIO = 0.8;
/** A project that accounts for at least this share of the units drives the usage. */
const MAIN_CONSUMER_SHARE = 0.5;

type OrganizationOverviewData =
  RouterOutputs["projectsOverview"]["byOrganization"];

type SessionOrganization = {
  id: string;
  name: string;
  plan: Plan;
  role: Role;
  projects: Array<{
    id: string;
    name: string;
    role: Role;
    retentionDays: number | null;
    hasTraces: boolean;
    deletedAt: Date | string | null;
  }>;
};

export type UsageLevel =
  | "within-limit"
  | "near-limit"
  | "over-limit"
  | "unlimited";

export type AttentionReason =
  | "not-set-up"
  | "stale"
  | "inactive"
  | "v4-migration"
  | "usage";

export type ProjectOverview = {
  id: string;
  name: string;
  organizationId: string;
  role: Role;
  retentionDays: number | null;
  isDeleted: boolean;
  ingestion: IngestionStatus;
  /** `null` when the user may not read usage. `share` is of the organization's counted units. */
  usage: { units: number; share: number } | null;
  /** `null` where the v4 migration is not shown. */
  migration: ProjectMigrationReadiness | null;
  attention: AttentionReason[];
};

export type OrganizationOverview = {
  id: string;
  name: string;
  plan: Plan;
  role: Role;
  isDemo: boolean;
  loadState: "loading" | "loaded" | "failed";
  memberCount: number | null;
  usage: {
    units: number;
    limit: number | null;
    ratio: number | null;
    level: UsageLevel;
    periodStart: Date;
    periodEnd: Date;
    periodKind: "billing-cycle" | "calendar-month";
    isIngestionBlocked: boolean;
  } | null;
  projects: ProjectOverview[];
};

const getUsageLevel = (units: number, limit: number | null): UsageLevel => {
  if (limit === null) return "unlimited";
  if (units >= limit) return "over-limit";
  if (units >= limit * NEAR_LIMIT_RATIO) return "near-limit";
  return "within-limit";
};

const getLoadState = (
  isLoaded: boolean,
  hasFailed: boolean,
): OrganizationOverview["loadState"] => {
  if (isLoaded) return "loaded";
  return hasFailed ? "failed" : "loading";
};

const ingestionAttention: Partial<
  Record<IngestionStatus["kind"], AttentionReason>
> = {
  "not-set-up": "not-set-up",
  stale: "stale",
  inactive: "inactive",
};

/**
 * Turns the session's organizations and the per-organization overview reads
 * into what the overview renders: each project's ingestion state, usage share
 * and v4 readiness, the organization's usage level, and why a project needs
 * attention. The demo organization goes last.
 */
export function buildProjectsOverview({
  organizations,
  overviewByOrganizationId,
  migrationReadinessByProjectId,
  failedOrganizationIds,
  demoOrganizationId,
  now,
}: {
  organizations: SessionOrganization[];
  /** Organizations whose read has not resolved yet are missing. */
  overviewByOrganizationId: Map<string, OrganizationOverviewData>;
  failedOrganizationIds: Set<string>;
  migrationReadinessByProjectId: Map<string, ProjectMigrationReadiness> | null;
  demoOrganizationId: string | null;
  now: number;
}): OrganizationOverview[] {
  return organizations
    .toSorted(
      (a, b) =>
        Number(a.id === demoOrganizationId) -
        Number(b.id === demoOrganizationId),
    )
    .map((organization) => {
      const data = overviewByOrganizationId.get(organization.id);
      const projectData = new Map(
        (data?.projects ?? []).map((project) => [project.projectId, project]),
      );
      const countedUnits = (data?.projects ?? []).reduce(
        (sum, project) => sum + (project.periodUnits ?? 0),
        0,
      );
      const usage = data?.usage
        ? {
            units: data.usage.units,
            limit: data.usage.limit,
            ratio:
              data.usage.limit === null
                ? null
                : data.usage.units / data.usage.limit,
            level: getUsageLevel(data.usage.units, data.usage.limit),
            periodStart: data.usage.periodStart,
            periodEnd: data.usage.periodEnd,
            periodKind: data.usage.periodKind,
            isIngestionBlocked: data.usage.isIngestionBlocked,
          }
        : null;
      const isUsageTight =
        usage !== null &&
        (usage.level === "near-limit" ||
          usage.level === "over-limit" ||
          usage.isIngestionBlocked);

      const projects = organization.projects
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((project): ProjectOverview => {
          const isDeleted = Boolean(project.deletedAt);
          const row = projectData.get(project.id);
          const ingestion = getIngestionStatus({
            hasTraces: project.hasTraces,
            lastTraceAt: data ? (row?.lastTraceAt ?? null) : undefined,
            now,
          });
          const units = row?.periodUnits ?? null;
          const share =
            units !== null && countedUnits > 0 ? units / countedUnits : 0;
          const migration = isDeleted
            ? null
            : (migrationReadinessByProjectId?.get(project.id) ?? null);
          const attention: AttentionReason[] = isDeleted
            ? []
            : [
                ingestionAttention[ingestion.kind],
                migration === "action-needed" ? "v4-migration" : undefined,
                isUsageTight && share >= MAIN_CONSUMER_SHARE
                  ? "usage"
                  : undefined,
              ].filter(
                (reason): reason is AttentionReason => reason !== undefined,
              );

          return {
            id: project.id,
            name: project.name,
            organizationId: organization.id,
            role: project.role,
            retentionDays: project.retentionDays,
            isDeleted,
            ingestion,
            usage: units === null || isDeleted ? null : { units, share },
            migration,
            attention,
          };
        });

      return {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        role: organization.role,
        isDemo: organization.id === demoOrganizationId,
        loadState: getLoadState(
          data !== undefined,
          failedOrganizationIds.has(organization.id),
        ),
        memberCount: data?.memberCount ?? null,
        usage,
        projects,
      };
    });
}
