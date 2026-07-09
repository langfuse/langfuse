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
 * replaying the live sync's additive events (upsertUser, upsertOrg,
 * setUserRole); it never issues removeUser, since a backfill only adds.
 *
 * WHAT IT DOES — three dependency-ordered passes (leads must exist before they
 * can be linked to accounts, exactly as the live sync enforces):
 *
 *   Pass 1  upsertUser   — one Lead per user that has an email, with the
 *                          signup date (users.created_at) and a lead source
 *                          derived from history: earliest surviving non-NONE,
 *                          non-excluded org membership created with role
 *                          OWNER → "Langfuse Cloud Signup", any other role →
 *                          "Langfuse Cloud Invite". Users without memberships
 *                          are Signup unless a pending invitation exists for
 *                          their email (→ Invite). Accepted invitations are
 *                          deleted on accept, so this is a heuristic, not a
 *                          record.
 *   Pass 2  upsertOrg    — one Account per org, org-only payload (Mulesoft
 *                          ignores user fields on updateOrg; members are
 *                          linked in pass 3): created date, current tier
 *                          (resolved like entitlements), and — for orgs paid
 *                          via Stripe — the converted-to-paid date, which is
 *                          the billing cycle anchor (set from the first paid
 *                          subscription). Orgs on a manual cloudConfig.plan
 *                          send their tier but no conversion date; sales owns
 *                          those records in SFDC. Also persists
 *                          organizations.sfdc_org_id.
 *   Pass 3  setUserRole  — one org-member bridge per non-NONE membership,
 *                          INCLUDING the owner (upsertOrg links nobody, so
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
import {
  getSfdcService,
  toSfdcPlan,
  type SfdcLeadSource,
} from "@/src/ee/features/sfdc-sync/server";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { parseDbOrg } from "@langfuse/shared";
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
    orgsSkippedNonCloudPlan: 0,
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

  // Pending invitations mark not-yet-accepted invite leads. Accepted
  // invitations are deleted, so for everyone else the lead source is derived
  // from membership role history below. Pending invites are a small table —
  // load the emails once instead of querying per user.
  const pendingInviteEmails = new Set(
    (
      await prisma.membershipInvitation.findMany({ select: { email: true } })
    ).map((invite) => invite.email.toLowerCase()),
  );

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
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          organizationMemberships: {
            where: { role: { not: Role.NONE } },
            select: { orgId: true, role: true },
            orderBy: { createdAt: "asc" },
          },
        },
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
        // Heuristic: users whose earliest real membership was created as
        // OWNER signed up on their own (starter org / self-created org);
        // everyone else got pulled in by an existing org. Excluded orgs
        // (demo org, --exclude-org) don't count as "real".
        const firstMembership = u.organizationMemberships.find(
          (m) => !cli.excludeOrgIds.has(m.orgId),
        );
        const leadSource: SfdcLeadSource = firstMembership
          ? firstMembership.role === Role.OWNER
            ? "Langfuse Cloud Signup"
            : "Langfuse Cloud Invite"
          : pendingInviteEmails.has(u.email.toLowerCase())
            ? "Langfuse Cloud Invite"
            : "Langfuse Cloud Signup";
        sample("upsertUser", {
          userId: u.id,
          email: u.email,
          createdAt: u.createdAt.toISOString(),
          leadSource,
        });
        if (cli.execute)
          await sfdc.upsertUser({
            userId: u.id,
            email: u.email,
            name: u.name,
            createdAt: u.createdAt,
            leadSource,
          });
        counts.leads++;
      });
      logger.info(`[SFDC backfill] pass 1 (leads): ${counts.leads} processed`);
    }
  }

  // ---- Pass 2: Accounts (upsertOrg) ----
  // Org-only payload — Mulesoft ignores user fields on updateOrg, so no
  // representative member is needed (orgs without any emailed member get an
  // Account too). Member bridges (every member, owner included) are
  // established in pass 3.
  {
    let cursorId: string | undefined;
    let processed = 0;
    for (;;) {
      if (cli.limit !== undefined && processed >= cli.limit) break;
      const take = cli.limit
        ? Math.min(cli.batchSize, cli.limit - processed)
        : cli.batchSize;
      // Full rows: parseDbOrg + plan resolution need cloudConfig et al.
      const orgs = await prisma.organization.findMany({
        where: cli.orgId ? { id: cli.orgId } : {},
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
        const parsedOrg = parseDbOrg(org);
        const resolvedPlan = getOrganizationPlanServerSide(
          parsedOrg.cloudConfig ?? undefined,
        );
        const plan = toSfdcPlan(resolvedPlan);
        if (!plan) {
          // Non-cloud plan cannot happen here (the service factory asserted
          // we are on Cloud) — skip defensively rather than guessing a tier.
          counts.orgsSkippedNonCloudPlan++;
          logger.warn("[SFDC backfill] skipping org — non-cloud plan", {
            orgId: org.id,
            resolvedPlan,
          });
          return;
        }
        // The billing cycle anchor is set from the org's first paid Stripe
        // subscription and untouched by plan switches, so it doubles as the
        // Hobby→paid conversion date. Only trust it for orgs currently paid
        // via Stripe; manual cloudConfig.plan orgs carry the row default
        // (org creation) — sales owns their conversion dates in SFDC.
        const convertedToPaidAt =
          resolvedPlan !== "cloud:hobby" &&
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId
            ? parsedOrg.cloudBillingCycleAnchor
            : undefined;
        sample("upsertOrg", {
          orgId: org.id,
          createdAt: org.createdAt.toISOString(),
          plan,
          convertedToPaidAt: convertedToPaidAt?.toISOString() ?? "(omitted)",
        });
        if (cli.execute)
          await sfdc.upsertOrg({
            orgId: org.id,
            orgName: org.name,
            createdAt: org.createdAt,
            plan,
            convertedToPaidAt,
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
          // Single orgId condition: two spreads both writing the `orgId` key
          // would silently drop the canary --org-id filter whenever the
          // exclusion list is non-empty (the demo org always is in it).
          ...(cli.orgId
            ? { orgId: cli.orgId }
            : cli.excludeOrgIds.size
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
