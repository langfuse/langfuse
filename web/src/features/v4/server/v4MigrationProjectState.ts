import {
  type PrismaClient,
  type V4MigrationProjectState,
} from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";

// Server-side outcome events (never reused as client event names): emitted
// with set-once semantics from the state table below, so each project counts
// "migration started" and "migrated" at most once — immune to ad blockers and
// duplicate tabs, unlike the client-side v4_migration:* funnel events.
const MIGRATION_STARTED_EVENT = "v4_migration:project_migration_started";
const MIGRATED_EVENT = "v4_migration:project_migrated";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The client only reports settled, non-error states; "checking" and "error"
// snapshots carry no reliable information and never reach this module.
export type V4MigrationReportedState = {
  readiness: "ready" | "action-needed" | "partner-managed";
  sdkStatus:
    | "no_data"
    | "unknown"
    | "otel_realtime"
    | "otel_header_required"
    | "legacy"
    | "latest";
  hasV4Traffic: boolean;
};

type StoredState = Pick<
  V4MigrationProjectState,
  | "readiness"
  | "sdkStatus"
  | "hasV4Traffic"
  | "firstActionNeededAt"
  | "migrationStartedAt"
  | "migrationStartedByUserId"
  | "migratedAt"
>;

export type V4MigrationTransitionDecision = {
  row: {
    readiness: string;
    sdkStatus: string;
    hasV4Traffic: boolean;
    firstActionNeededAt: Date | null;
    migrationStartedAt: Date | null;
    migrationStartedByUserId: string | null;
    migratedAt: Date | null;
  };
  events: Array<typeof MIGRATION_STARTED_EVENT | typeof MIGRATED_EVENT>;
};

/**
 * Pure transition rules. `previous === null` means first sighting: it sets a
 * baseline and only "migration started" may fire (v4 traffic is directly
 * observable), while "migrated" needs a recorded action-needed baseline so
 * always-ready projects never count as migrations. `reportingUserId`
 * attributes the started-transition to whoever's session first reported it —
 * the best available proxy for who performed the migration.
 */
export const decideV4MigrationTransitions = (
  previous: StoredState | null,
  reported: V4MigrationReportedState,
  now: Date,
  reportingUserId: string,
): V4MigrationTransitionDecision => {
  const events: V4MigrationTransitionDecision["events"] = [];

  const firstActionNeededAt =
    previous?.firstActionNeededAt ??
    (reported.readiness === "action-needed" ? now : null);

  const migratedNow =
    !previous?.migratedAt &&
    previous?.readiness === "action-needed" &&
    reported.readiness === "ready";

  // "Started" = v4 traffic exists while the migration is (or just was) in
  // flight. Always-ready projects have v4 traffic trivially and never fire.
  const startedNow =
    !previous?.migrationStartedAt &&
    reported.hasV4Traffic &&
    (reported.readiness === "action-needed" || migratedNow);

  if (startedNow) events.push(MIGRATION_STARTED_EVENT);
  if (migratedNow) events.push(MIGRATED_EVENT);

  return {
    row: {
      readiness: reported.readiness,
      sdkStatus: reported.sdkStatus,
      hasV4Traffic: reported.hasV4Traffic,
      firstActionNeededAt,
      migrationStartedAt: startedNow
        ? now
        : (previous?.migrationStartedAt ?? null),
      migrationStartedByUserId: startedNow
        ? reportingUserId
        : (previous?.migrationStartedByUserId ?? null),
      migratedAt: migratedNow ? now : (previous?.migratedAt ?? null),
    },
    events,
  };
};

const daysBetween = (from: Date | null, to: Date): number | null =>
  from ? Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) : null;

type RecorderDependencies = {
  capture: ServerPosthog["capture"];
  cloudRegion?: string;
  now: () => Date;
};

export const createV4MigrationStateRecorder = ({
  capture,
  cloudRegion,
  now,
}: RecorderDependencies) => {
  return async ({
    prisma,
    userId,
    organizationId,
    projectId,
    state,
  }: {
    prisma: PrismaClient;
    userId: string;
    organizationId: string;
    projectId: string;
    state: V4MigrationReportedState;
  }): Promise<void> => {
    try {
      const timestamp = now();
      let previous = await prisma.v4MigrationProjectState.findUnique({
        where: { projectId },
      });
      let decision = decideV4MigrationTransitions(
        previous,
        state,
        timestamp,
        userId,
      );

      let created = false;
      if (!previous) {
        try {
          await prisma.v4MigrationProjectState.create({
            data: { projectId, ...decision.row },
          });
          created = true;
        } catch {
          // Lost a concurrent-create race. The report must still reconcile
          // against the winner's row — dropping it could discard the
          // action-needed baseline that a later ready report needs for the
          // migrated transition to ever fire.
          previous = await prisma.v4MigrationProjectState.findUnique({
            where: { projectId },
          });
          if (!previous) return;
          decision = decideV4MigrationTransitions(
            previous,
            state,
            timestamp,
            userId,
          );
        }
      }
      if (!created && previous) {
        // Set-once fields are guarded by conditional updateMany so concurrent
        // reports (multiple tabs) cannot double-emit an outcome event.
        for (const field of ["migrationStartedAt", "migratedAt"] as const) {
          const value = decision.row[field];
          if (value && !previous[field]) {
            const { count } = await prisma.v4MigrationProjectState.updateMany({
              where: { projectId, [field]: null },
              data: {
                [field]: value,
                ...(field === "migrationStartedAt"
                  ? {
                      migrationStartedByUserId:
                        decision.row.migrationStartedByUserId,
                    }
                  : {}),
              },
            });
            if (count !== 1) {
              decision.events = decision.events.filter(
                (event) =>
                  event !==
                  (field === "migratedAt"
                    ? MIGRATED_EVENT
                    : MIGRATION_STARTED_EVENT),
              );
            }
          }
        }
        await prisma.v4MigrationProjectState.update({
          where: { projectId },
          data: {
            readiness: decision.row.readiness,
            sdkStatus: decision.row.sdkStatus,
            hasV4Traffic: decision.row.hasV4Traffic,
            firstActionNeededAt: decision.row.firstActionNeededAt,
          },
        });
      }

      if (!cloudRegion) return;
      for (const event of decision.events) {
        // Tenant ids and enums only — mirrors backend:activity's shape.
        capture({
          distinctId: userId,
          event,
          properties: {
            cloudRegion,
            organizationId,
            projectId,
            readiness: decision.row.readiness,
            sdkStatus: decision.row.sdkStatus,
            daysSinceFirstActionNeeded: daysBetween(
              decision.row.firstActionNeededAt,
              timestamp,
            ),
            ...(event === MIGRATED_EVENT
              ? {
                  daysSinceMigrationStarted: daysBetween(
                    decision.row.migrationStartedAt,
                    timestamp,
                  ),
                }
              : {}),
          },
          timestamp,
          disableGeoip: true,
        });
      }
    } catch (error) {
      // Product analytics must never fail the reporting request.
      logger.warn("Failed to record v4 migration project state", { error });
    }
  };
};

let serverPosthog: ServerPosthog | undefined;

export const recordV4MigrationProjectState = createV4MigrationStateRecorder({
  capture: (event) => {
    serverPosthog ??= new ServerPosthog();
    serverPosthog.capture(event);
  },
  cloudRegion:
    env.NODE_ENV === "production"
      ? env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      : undefined,
  now: () => new Date(),
});
