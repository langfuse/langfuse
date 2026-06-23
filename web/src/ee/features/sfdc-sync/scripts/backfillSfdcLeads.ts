/**
 * One-off backfill of pre-existing orgs, users, and memberships into SFDC via
 * the live Mulesoft sync service.
 *
 * WHY THIS EXISTS
 * ---------------
 * The live sync (web/src/ee/features/sfdc-sync) only fires going forward, from
 * user/org/membership lifecycle events. Everything created before the
 * integration shipped — plus self-serve starter orgs, which the live sync does
 * not cover — is absent from SFDC. This script reconstructs that state by
 * replaying the same four events the live sync uses.
 *
 * WHAT IT DOES — three dependency-ordered passes (leads must exist before they
 * can be linked to accounts, exactly as the live sync enforces):
 *
 *   Pass 1  upsertUser   — one Lead per user that has an email.
 *   Pass 2  upsertOrg    — one Account per org. upsertOrg does NOT link any
 *                          member, so the representative owner
 *                          (OWNER > ADMIN > earliest non-NONE member w/ email)
 *                          is only there to satisfy the payload. Also persists
 *                          organizations.sfdc_org_id.
 *   Pass 3  setUserRole  — one org-member bridge per non-NONE membership,
 *                          INCLUDING the owner (upsertOrg created no link, so
 *                          every member — owner included — needs setUserRole).
 *
 * IDEMPOTENCY / SAFETY
 * --------------------
 * Re-running is safe ONLY if Mulesoft matches records by Langfuse id/email
 * (Langfuse stores no Lead id, so dedup is delegated entirely to Mulesoft).
 * CONFIRM THAT before running with --execute, or you risk one duplicate Lead
 * per existing user. See the team's Mulesoft/SFDC contract.
 *
 * Defaults to DRY-RUN: it logs intended calls and never hits Mulesoft unless
 * --execute is passed. SfdcService never throws and returns void, so per-call
 * success/failure is only visible in the `[SFDC]` log lines, not in this
 * script's tallies (which count attempts, not outcomes).
 *
 * HOW TO RUN
 * ----------
 * The web prod image is a Next.js standalone build and does NOT ship src/tsx,
 * so run this from a full repo checkout / CI job that has prod env set
 * (DATABASE_URL, MULESOFT_SFDC_*, NEXT_PUBLIC_LANGFUSE_CLOUD_REGION), e.g.:
 *
 *   pnpm --filter web sfdc:backfill                       # dry-run, all orgs
 *   pnpm --filter web sfdc:backfill -- --org-id <id>      # dry-run, one org
 *   pnpm --filter web sfdc:backfill -- --org-id <id> --execute   # canary
 *   pnpm --filter web sfdc:backfill -- --execute          # full run
 *
 * Flags:
 *   --execute                send to Mulesoft (default: dry-run)
 *   --org-id <id>            restrict all passes to a single org (canary)
 *   --concurrency <n>        in-flight requests per pass (default 3)
 *   --batch-size <n>         DB page size (default 500)
 *   --limit <n>             cap rows processed per pass (smoke test)
 *   --exclude-org <id>       extra org id to skip (repeatable)
 *   --skip-recent-minutes <n>  skip memberships updated within the last n
 *                              minutes (reduces the resurrection race vs the
 *                              live sync; pass 3 only)
 */
import { parseArgs } from "node:util";

import { env } from "@/src/env.mjs";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

type Cli = {
  execute: boolean;
  orgId?: string;
  concurrency: number;
  batchSize: number;
  limit?: number;
  excludeOrgIds: Set<string>;
  skipRecentMinutes: number;
};

function parseCli(): Cli {
  const { values } = parseArgs({
    options: {
      execute: { type: "boolean", default: false },
      "org-id": { type: "string" },
      concurrency: { type: "string", default: "3" },
      "batch-size": { type: "string", default: "500" },
      limit: { type: "string" },
      "exclude-org": { type: "string", multiple: true, default: [] },
      "skip-recent-minutes": { type: "string", default: "0" },
    },
    allowPositionals: false,
  });

  const toInt = (v: string | undefined, fallback: number) => {
    if (v === undefined) return fallback;
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`Invalid numeric flag value: ${v}`);
    return n;
  };

  const excludeOrgIds = new Set<string>(values["exclude-org"] as string[]);
  if (env.NEXT_PUBLIC_DEMO_ORG_ID)
    excludeOrgIds.add(env.NEXT_PUBLIC_DEMO_ORG_ID);

  return {
    execute: values.execute as boolean,
    orgId: values["org-id"] as string | undefined,
    concurrency: toInt(values.concurrency as string, 3),
    batchSize: toInt(values["batch-size"] as string, 500),
    limit: values.limit ? toInt(values.limit as string, 0) : undefined,
    excludeOrgIds,
    skipRecentMinutes: toInt(values["skip-recent-minutes"] as string, 0),
  };
}

/** Bounded-concurrency map; preserves input order, never rejects on item error. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
}

const ROLE_PRIORITY: Record<string, number> = {
  [Role.OWNER]: 0,
  [Role.ADMIN]: 1,
  [Role.MEMBER]: 2,
  [Role.VIEWER]: 3,
};

async function main() {
  const cli = parseCli();
  const sfdc = getSfdcService();
  if (!sfdc) {
    throw new Error(
      "[SFDC backfill] getSfdcService() returned null — not on Langfuse Cloud " +
        "or a MULESOFT_SFDC_* env var is missing. Refusing to run.",
    );
  }

  const mode = cli.execute ? "EXECUTE (live POSTs)" : "DRY-RUN (no POSTs)";
  logger.info(`[SFDC backfill] starting — mode=${mode}`, {
    orgId: cli.orgId ?? "(all)",
    concurrency: cli.concurrency,
    batchSize: cli.batchSize,
    limit: cli.limit ?? "(none)",
    excludeOrgIds: [...cli.excludeOrgIds],
    skipRecentMinutes: cli.skipRecentMinutes,
  });

  const counts = {
    leads: 0,
    leadsSkippedNoEmail: 0,
    orgs: 0,
    orgsSkippedNoOwner: 0,
    orgsSkippedExcluded: 0,
    bridges: 0,
  };
  let sampled = 0;
  const sample = (label: string, payload: Record<string, unknown>) => {
    if (!cli.execute && sampled < 10) {
      logger.info(`[SFDC backfill] would ${label}`, payload);
      sampled++;
    }
  };

  // ---- Pass 1: Leads (upsertUser) ----
  {
    let cursorId: string | undefined;
    let processed = 0;
    for (;;) {
      if (cli.limit !== undefined && processed >= cli.limit) break;
      const take = cli.limit
        ? Math.min(cli.batchSize, cli.limit - processed)
        : cli.batchSize;
      const users = await prisma.user.findMany({
        where: {
          email: { not: null },
          ...(cli.orgId
            ? { organizationMemberships: { some: { orgId: cli.orgId } } }
            : {}),
        },
        select: { id: true, email: true, name: true },
        orderBy: { id: "asc" },
        take,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (users.length === 0) break;
      cursorId = users[users.length - 1].id;
      processed += users.length;

      await mapWithConcurrency(users, cli.concurrency, async (u) => {
        if (!u.email) {
          counts.leadsSkippedNoEmail++;
          return;
        }
        sample("upsertUser", { userId: u.id, email: u.email });
        if (cli.execute)
          await sfdc.upsertUser({ userId: u.id, email: u.email, name: u.name });
        counts.leads++;
      });
      logger.info(`[SFDC backfill] pass 1 (leads): ${counts.leads} processed`);
    }
  }

  // ---- Pass 2: Accounts (upsertOrg) ----
  // upsertOrg creates the SFDC Account only; it does not link members, so the
  // representative owner is just to satisfy the payload. Member bridges (for
  // every member, owner included) are established in pass 3.
  {
    let cursorId: string | undefined;
    let processed = 0;
    for (;;) {
      if (cli.limit !== undefined && processed >= cli.limit) break;
      const take = cli.limit
        ? Math.min(cli.batchSize, cli.limit - processed)
        : cli.batchSize;
      const orgs = await prisma.organization.findMany({
        where: cli.orgId ? { id: cli.orgId } : {},
        select: { id: true, name: true },
        orderBy: { id: "asc" },
        take,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (orgs.length === 0) break;
      cursorId = orgs[orgs.length - 1].id;
      processed += orgs.length;

      await mapWithConcurrency(orgs, cli.concurrency, async (org) => {
        if (cli.excludeOrgIds.has(org.id)) {
          counts.orgsSkippedExcluded++;
          return;
        }
        // Representative owner: lowest role priority, earliest createdAt.
        const candidates = await prisma.organizationMembership.findMany({
          where: {
            orgId: org.id,
            role: { not: Role.NONE },
            user: { email: { not: null } },
          },
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: { select: { email: true } },
          },
          orderBy: { createdAt: "asc" },
        });
        const owner = candidates.reduce<(typeof candidates)[number] | null>(
          (best, m) =>
            best === null || ROLE_PRIORITY[m.role] < ROLE_PRIORITY[best.role]
              ? m
              : best,
          null,
        );
        if (!owner || !owner.user.email) {
          counts.orgsSkippedNoOwner++;
          logger.warn("[SFDC backfill] skipping org — no emailed member", {
            orgId: org.id,
          });
          return;
        }
        sample("upsertOrg", {
          orgId: org.id,
          ownerUserId: owner.userId,
          role: owner.role,
        });
        if (cli.execute)
          await sfdc.upsertOrg({
            orgId: org.id,
            orgName: org.name,
            userId: owner.userId,
            email: owner.user.email,
            role: owner.role,
          });
        counts.orgs++;
      });
      logger.info(`[SFDC backfill] pass 2 (orgs): ${counts.orgs} processed`);
    }
  }

  // ---- Pass 3: Member bridges (setUserRole) for every non-NONE member ----
  {
    const recentCutoff =
      cli.skipRecentMinutes > 0
        ? new Date(Date.now() - cli.skipRecentMinutes * 60_000)
        : undefined;
    let cursorId: string | undefined;
    let processed = 0;
    for (;;) {
      if (cli.limit !== undefined && processed >= cli.limit) break;
      const take = cli.limit
        ? Math.min(cli.batchSize, cli.limit - processed)
        : cli.batchSize;
      const memberships = await prisma.organizationMembership.findMany({
        where: {
          role: { not: Role.NONE },
          user: { email: { not: null } },
          ...(cli.orgId ? { orgId: cli.orgId } : {}),
          ...(cli.excludeOrgIds.size
            ? { orgId: { notIn: [...cli.excludeOrgIds] } }
            : {}),
          ...(recentCutoff ? { updatedAt: { lt: recentCutoff } } : {}),
        },
        select: {
          id: true,
          orgId: true,
          userId: true,
          role: true,
          user: { select: { email: true } },
        },
        orderBy: { id: "asc" },
        take,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (memberships.length === 0) break;
      cursorId = memberships[memberships.length - 1].id;
      processed += memberships.length;

      await mapWithConcurrency(memberships, cli.concurrency, async (m) => {
        if (!m.user.email) return;
        sample("setUserRole", {
          orgId: m.orgId,
          userId: m.userId,
          role: m.role,
        });
        if (cli.execute)
          await sfdc.setUserRole({
            orgId: m.orgId,
            userId: m.userId,
            email: m.user.email,
            role: m.role,
          });
        counts.bridges++;
      });
      logger.info(
        `[SFDC backfill] pass 3 (bridges): ${counts.bridges} processed`,
      );
    }
  }

  logger.info(`[SFDC backfill] done — mode=${mode}`, counts);
  if (!cli.execute)
    logger.info(
      "[SFDC backfill] DRY-RUN complete — re-run with --execute to send. " +
        "Confirm Mulesoft Lead idempotency first.",
    );
}

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error("[SFDC backfill] failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      process.exit(process.exitCode ?? 0);
    });
}
