/**
 * One-off backfill of pre-existing orgs, users, and memberships into SFDC via
 * the live Mulesoft sync service — processed one organization at a time.
 *
 * WHY THIS EXISTS
 * ---------------
 * The live sync (web/src/ee/features/sfdc-sync) only fires going forward, from
 * user/org/membership lifecycle events. Everything created before the
 * integration shipped is absent from SFDC. This script reconstructs that state by
 * replaying the live sync's additive events (upsertOrg, upsertUser,
 * setUserRole); it never issues removeUser, since a backfill only adds.
 *
 * WHAT IT DOES — one org unit at a time, strictly sequentially, so each org
 * can be confirmed done before the next one starts:
 *
 *   1. upsertOrg    — org-only Account payload: created date, current tier (resolved like
 *                     entitlements), and — for orgs paid via Stripe — the
 *                     converted-to-paid date (= billing cycle anchor, set from
 *                     the first paid subscription). Manual cloudConfig.plan
 *                     orgs send their tier but no conversion date; sales owns
 *                     those records in SFDC. Also persists
 *                     organizations.sfdc_org_id. On delivery failure the
 *                     org's members are NOT processed (SFDC needs the Account
 *                     before member bridges, as the live sync enforces) and
 *                     the org is reported for retry.
 *   2. upsertUser   — one Lead per member (non-NONE role, has an email) not
 *                     already sent this run. Lead source is derived from the
 *                     user's GLOBAL membership history, independent of which
 *                     org triggered the send: earliest surviving non-NONE,
 *                     non-excluded membership created with role OWNER →
 *                     "Langfuse Cloud Signup", any other role → "Langfuse
 *                     Cloud Invite"; no such membership → Invite if a pending
 *                     invitation exists for the email, else Signup. Accepted
 *                     invitations are deleted on accept, so this is a
 *                     heuristic, not a record.
 *   3. setUserRole  — one org-member bridge per non-NONE membership,
 *                     INCLUDING the owner (upsertOrg links nobody). Skipped
 *                     for members whose Lead failed to deliver this run (the
 *                     Lead must exist before the bridge — live-sync
 *                     invariant); the org is then reported for retry.
 *
 * An org counts as COMPLETE only when the Account and every syncable member
 * Lead + bridge were 2xx-acked by Mulesoft. Members without an email are
 * invisible to SFDC by design (the live sync skips them too) and do not block
 * completeness; their count appears in the per-org summary line. All orgs
 * with any failure are listed at the end in --org-id-csv format for a retry
 * run.
 *
 * After the org loop, a FULL RUN (no --org-id / --org-id-csv) ends with an
 * orphan-user sweep: Leads for users who have an email but no non-NONE
 * membership in any non-excluded org (unaccepted invites, users who left all
 * orgs, NONE-only project members) — the org iteration never visits them.
 * Scoped runs skip the sweep.
 *
 * IDEMPOTENCY / SAFETY
 * --------------------
 * Re-running is safe ONLY if Mulesoft matches records by Langfuse id/email
 * (Langfuse stores no Lead id, so dedup is delegated entirely to Mulesoft).
 * CONFIRM THAT before running with --execute, or you risk one duplicate Lead
 * per existing user. See the team's Mulesoft/SFDC contract.
 *
 * DEMO ORG: on Cloud, EVERY signup gets a VIEWER membership in the region's
 * demo org (createProjectMembershipsOnSignup) that the live sync never
 * syncs. An unexcluded demo org would therefore bridge every user to one
 * Account and, because VIEWER != OWNER, skew every organic signup's lead
 * source to "Invite". The script refuses to start unless
 * NEXT_PUBLIC_DEMO_ORG_ID is set (use the region's deployed value) and
 * always excludes that org from processing, the lead-source heuristic, and
 * the orphan sweep.
 *
 * Two exclusion semantics, deliberately distinct:
 *   - EXCLUDED (demo org, --exclude-org): the org does not exist as far as
 *     this script is concerned — never synced, invisible to the lead-source
 *     heuristic and the orphan sweep.
 *   - ALREADY DONE (--exclude-org-csv): the org was backfilled by an earlier
 *     run — its org unit is skipped, but it still counts for lead-source
 *     derivation and orphan detection, so users shared with not-yet-done
 *     orgs get identical lead sources in every run.
 *
 * Defaults to DRY-RUN: it logs intended calls and never hits Mulesoft unless
 * --execute is passed.
 *
 * HOW TO RUN
 * ----------
 * The web prod image is a Next.js standalone build and does NOT ship src/tsx,
 * so run this from a full repo checkout / CI job that has prod env set
 * (DATABASE_URL, MULESOFT_SFDC_*, NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, and
 * NODE_ENV — env.mjs validation rejects an unset NODE_ENV under tsx), e.g.:
 *
 *   pnpm --filter web sfdc:backfill                            # dry-run, all
 *   pnpm --filter web sfdc:backfill -- --org-id <id>           # dry-run, one
 *   pnpm --filter web sfdc:backfill -- --org-id <id> --execute # canary
 *   pnpm --filter web sfdc:backfill -- --org-id-csv ids.csv --execute
 *   pnpm --filter web sfdc:backfill -- --execute               # full run
 *
 * Flags:
 *   --execute                send to Mulesoft (default: dry-run)
 *   --org-id <id>            process exactly one org (canary)
 *   --org-id-csv <file>      process the org ids listed in <file>, one per
 *                            row, in file order. Blank lines and #-comments
 *                            are skipped, a lone org_id/id header row is
 *                            tolerated, and only the first comma-separated
 *                            cell of each row is read. Unknown ids are
 *                            logged and counted, not fatal.
 *   --start-after <org-id>   resume: full run → skip ids <= this org id
 *                            (orgs are iterated in ascending id order);
 *                            CSV run → drop rows up to and including it.
 *   --limit <n>              cap orgs processed (and orphan-sweep users)
 *   --concurrency <n>        in-flight requests per stage within an org
 *                            (orgs themselves are sequential; default 1)
 *   --batch-size <n>         DB page size (default 500)
 *   --exclude-org <id>       treat like the demo org: never sync it and hide
 *                            it from the lead-source heuristic and orphan
 *                            sweep (repeatable). NEXT_PUBLIC_DEMO_ORG_ID is
 *                            always added.
 *   --exclude-org-csv <file> org ids ALREADY BACKFILLED by earlier runs
 *                            (same file format as --org-id-csv): skip their
 *                            org units but keep them visible to lead-source
 *                            derivation and orphan detection.
 *   --skip-recent-minutes <n>  skip bridges for memberships updated within
 *                              the last n minutes (reduces the resurrection
 *                              race vs the live sync; Leads still sent)
 */
import { readFileSync } from "node:fs";
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
  orgIdCsvPath?: string;
  startAfter?: string;
  concurrency: number;
  batchSize: number;
  limit?: number;
  /** Fully invisible orgs (demo + --exclude-org): never synced, ignored by
   * the lead-source heuristic and the orphan sweep. */
  excludeOrgIds: Set<string>;
  /** Already-backfilled orgs (--exclude-org-csv): org units skipped, but the
   * orgs stay visible to lead-source derivation and orphan detection. */
  alreadyDoneOrgIds: Set<string>;
  skipRecentMinutes: number;
};

function parseCli(): Cli {
  // `pnpm --filter web sfdc:backfill -- --flags` forwards the `--` separator
  // verbatim; drop it or parseArgs treats every flag after it as a positional.
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values } = parseArgs({
    args,
    options: {
      execute: { type: "boolean", default: false },
      "org-id": { type: "string" },
      "org-id-csv": { type: "string" },
      "start-after": { type: "string" },
      concurrency: { type: "string", default: "1" },
      "batch-size": { type: "string", default: "500" },
      limit: { type: "string" },
      "exclude-org": { type: "string", multiple: true, default: [] },
      "exclude-org-csv": { type: "string" },
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

  if (values["org-id"] && values["org-id-csv"])
    throw new Error("--org-id and --org-id-csv are mutually exclusive");
  if (values["org-id"] && values["start-after"])
    throw new Error("--start-after makes no sense with a single --org-id");

  // Refuse to run without the demo-org exclusion: on Cloud every user holds
  // a VIEWER membership in the demo org (created at signup, never synced by
  // the live sync), so an unexcluded demo org would bridge every user to one
  // Account and flip every organic signup's lead source to "Invite".
  if (!env.NEXT_PUBLIC_DEMO_ORG_ID)
    throw new Error(
      "NEXT_PUBLIC_DEMO_ORG_ID is not set — refusing to run. Set it to the " +
        "region's demo org id (same value as the region's web deployment) so " +
        "the demo org is excluded from sync, lead sources, and the orphan sweep.",
    );
  const excludeOrgIds = new Set<string>(values["exclude-org"] as string[]);
  excludeOrgIds.add(env.NEXT_PUBLIC_DEMO_ORG_ID);

  const alreadyDoneOrgIds = new Set<string>(
    values["exclude-org-csv"]
      ? readOrgIdCsv("--exclude-org-csv", values["exclude-org-csv"] as string)
      : [],
  );

  return {
    execute: values.execute as boolean,
    orgId: values["org-id"] as string | undefined,
    orgIdCsvPath: values["org-id-csv"] as string | undefined,
    startAfter: values["start-after"] as string | undefined,
    concurrency: toInt(values.concurrency as string, 1),
    batchSize: toInt(values["batch-size"] as string, 500),
    limit: values.limit ? toInt(values.limit as string, 0) : undefined,
    excludeOrgIds,
    alreadyDoneOrgIds,
    skipRecentMinutes: toInt(values["skip-recent-minutes"] as string, 0),
  };
}

/** One org id per row; #-comments, blanks, and a lone header row tolerated. */
function readOrgIdCsv(flag: string, path: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `${flag}: cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const value = line.split(",")[0].trim().replace(/^"|"$/g, "");
    if (!value || value.startsWith("#")) continue;
    if (index === 0 && /^(org_?id|id)$/i.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }
  if (ids.length === 0) throw new Error(`${flag}: no org ids found in ${path}`);
  return ids;
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

type OrgRow = Awaited<ReturnType<typeof prisma.organization.findMany>>[number];

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
    orgIdCsv: cli.orgIdCsvPath ?? "(none)",
    startAfter: cli.startAfter ?? "(none)",
    concurrency: cli.concurrency,
    batchSize: cli.batchSize,
    limit: cli.limit ?? "(none)",
    excludeOrgIds: [...cli.excludeOrgIds],
    alreadyDoneOrgCount: cli.alreadyDoneOrgIds.size,
    skipRecentMinutes: cli.skipRecentMinutes,
  });

  const counts = {
    orgsProcessed: 0,
    orgsComplete: 0,
    orgsIncomplete: 0,
    orgsAccountFailed: 0,
    orgsSkippedExcluded: 0,
    orgsSkippedAlreadyDone: 0,
    orgsSkippedNonCloudPlan: 0,
    orgsNotFound: 0,
    leadsSent: 0,
    leadsFailed: 0,
    bridgesSent: 0,
    bridgesFailed: 0,
    bridgesSkippedRecent: 0,
    bridgesSkippedLeadFailed: 0,
    membersSkippedNoEmail: 0,
    orphanLeadsSent: 0,
    orphanLeadsFailed: 0,
  };
  /** Orgs with any undelivered call — printed in --org-id-csv format at the end. */
  const retryOrgIds: string[] = [];

  let sampled = 0;
  const sample = (label: string, payload: Record<string, unknown>) => {
    if (!cli.execute && sampled < 10) {
      logger.info(`[SFDC backfill] would ${label}`, payload);
      sampled++;
    }
  };

  const nonExcludedOrgFilter = cli.excludeOrgIds.size
    ? { orgId: { notIn: [...cli.excludeOrgIds] } }
    : {};

  const recentCutoff =
    cli.skipRecentMinutes > 0
      ? new Date(Date.now() - cli.skipRecentMinutes * 60_000)
      : undefined;

  // Lead source from the user's global membership history — must not depend
  // on which org unit triggers the send, or multi-org users would get
  // order-dependent values.
  const resolveLeadSource = async (userId: string): Promise<SfdcLeadSource> => {
    const firstMembership = await prisma.organizationMembership.findFirst({
      where: {
        userId,
        role: { not: Role.NONE },
        ...nonExcludedOrgFilter,
      },
      orderBy: { createdAt: "asc" },
      select: { role: true },
    });
    if (firstMembership)
      return firstMembership.role === Role.OWNER
        ? "Langfuse Cloud Signup"
        : "Langfuse Cloud Invite";
    return "Langfuse Cloud Signup";
  };

  // One Lead send per user per run; multi-org users keep their first outcome
  // (identical payload either way, and a failed lead marks every org that
  // still needs it as incomplete, so a retry run re-attempts it).
  const leadOutcome = new Map<string, "sent" | "failed">();
  const sendLead = async (user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
  }): Promise<boolean> => {
    const existing = leadOutcome.get(user.id);
    if (existing) return existing === "sent";
    const leadSource = await resolveLeadSource(user.id);
    sample("upsertUser", {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      leadSource,
    });
    const ok = cli.execute
      ? await sfdc.upsertUser({
          userId: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          leadSource,
        })
      : true;
    leadOutcome.set(user.id, ok ? "sent" : "failed");
    return ok;
  };

  const fetchOrgMembers = async (orgId: string) => {
    const members = [];
    let cursorId: string | undefined;
    for (;;) {
      const page = await prisma.organizationMembership.findMany({
        where: {
          orgId,
          role: { not: Role.NONE },
          user: { email: { not: null } },
        },
        select: {
          id: true,
          userId: true,
          role: true,
          updatedAt: true,
          user: { select: { email: true, name: true, createdAt: true } },
        },
        orderBy: { id: "asc" },
        take: cli.batchSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      members.push(...page);
      if (page.length < cli.batchSize) break;
      cursorId = page[page.length - 1].id;
    }
    return members;
  };

  // ---- One org unit: Account, then member Leads, then member bridges ----
  const processOrg = async (org: OrgRow): Promise<void> => {
    if (cli.excludeOrgIds.has(org.id)) {
      counts.orgsSkippedExcluded++;
      return;
    }
    if (cli.alreadyDoneOrgIds.has(org.id)) {
      counts.orgsSkippedAlreadyDone++;
      return;
    }
    const parsedOrg = parseDbOrg(org);
    const resolvedPlan = getOrganizationPlanServerSide(
      parsedOrg.cloudConfig ?? undefined,
    );
    const plan = toSfdcPlan(resolvedPlan);
    if (!plan) {
      // Non-cloud plan cannot happen here (the service factory asserted we
      // are on Cloud) — skip defensively rather than guessing a tier.
      counts.orgsSkippedNonCloudPlan++;
      logger.warn("[SFDC backfill] skipping org — non-cloud plan", {
        orgId: org.id,
        resolvedPlan,
      });
      return;
    }
    counts.orgsProcessed++;

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
    const accountOk = cli.execute
      ? await sfdc.upsertOrg({
          orgId: org.id,
          orgName: org.name,
          createdAt: org.createdAt,
          plan,
          convertedToPaidAt,
        })
      : true;
    if (!accountOk) {
      counts.orgsAccountFailed++;
      retryOrgIds.push(org.id);
      logger.error(
        `[SFDC backfill] org ${org.id}: upsertOrg FAILED — skipping its members, org queued for retry`,
        { orgId: org.id },
      );
      return;
    }

    const members = await fetchOrgMembers(org.id);
    const noEmailMembers = await prisma.organizationMembership.count({
      where: { orgId: org.id, role: { not: Role.NONE }, user: { email: null } },
    });
    counts.membersSkippedNoEmail += noEmailMembers;

    const local = {
      leadsSent: 0,
      leadsFailed: 0,
      bridgesSent: 0,
      bridgesFailed: 0,
      bridgesSkippedRecent: 0,
      bridgesSkippedLeadFailed: 0,
    };

    // Stage 1: Leads — each member's Lead must exist before its bridge.
    await mapWithConcurrency(members, cli.concurrency, async (m) => {
      if (!m.user.email) return; // excluded by the query; type-level guard
      const firstEncounter = !leadOutcome.has(m.userId);
      const ok = await sendLead({
        id: m.userId,
        email: m.user.email,
        name: m.user.name,
        createdAt: m.user.createdAt,
      });
      if (!firstEncounter) return;
      if (ok) local.leadsSent++;
      else local.leadsFailed++;
    });

    // Stage 2: member bridges.
    await mapWithConcurrency(members, cli.concurrency, async (m) => {
      if (recentCutoff && m.updatedAt >= recentCutoff) {
        local.bridgesSkippedRecent++;
        return;
      }
      if (leadOutcome.get(m.userId) === "failed") {
        local.bridgesSkippedLeadFailed++;
        return;
      }
      sample("setUserRole", {
        orgId: org.id,
        userId: m.userId,
        role: m.role,
      });
      const ok = cli.execute
        ? await sfdc.setUserRole({
            orgId: org.id,
            userId: m.userId,
            email: m.user.email,
            role: m.role,
          })
        : true;
      if (ok) local.bridgesSent++;
      else local.bridgesFailed++;
    });

    counts.leadsSent += local.leadsSent;
    counts.leadsFailed += local.leadsFailed;
    counts.bridgesSent += local.bridgesSent;
    counts.bridgesFailed += local.bridgesFailed;
    counts.bridgesSkippedRecent += local.bridgesSkippedRecent;
    counts.bridgesSkippedLeadFailed += local.bridgesSkippedLeadFailed;

    // Recency-skipped bridges are deliberate (the live sync owns those
    // memberships), so they do not block completeness.
    const incomplete =
      local.leadsFailed + local.bridgesFailed + local.bridgesSkippedLeadFailed >
      0;
    if (incomplete) {
      counts.orgsIncomplete++;
      retryOrgIds.push(org.id);
    } else {
      counts.orgsComplete++;
    }
    logger.info(
      `[SFDC backfill] org ${org.id} ${incomplete ? "INCOMPLETE — queued for retry" : "complete"} (${counts.orgsProcessed} orgs processed)`,
      { orgId: org.id, members: members.length, noEmailMembers, ...local },
    );
  };

  const limitReached = () =>
    cli.limit !== undefined && counts.orgsProcessed >= cli.limit;

  // ---- Org loop: explicit target list (canary / CSV) or full iteration ----
  if (cli.orgId || cli.orgIdCsvPath) {
    let targetIds = cli.orgId
      ? [cli.orgId]
      : readOrgIdCsv("--org-id-csv", cli.orgIdCsvPath!);
    if (cli.startAfter) {
      const index = targetIds.indexOf(cli.startAfter);
      if (index === -1)
        throw new Error(
          `--start-after: org id ${cli.startAfter} not found in --org-id-csv file`,
        );
      targetIds = targetIds.slice(index + 1);
    }
    logger.info(
      `[SFDC backfill] processing ${targetIds.length} explicitly listed orgs in list order`,
    );
    for (
      let i = 0;
      i < targetIds.length && !limitReached();
      i += cli.batchSize
    ) {
      const chunk = targetIds.slice(i, i + cli.batchSize);
      const rows = await prisma.organization.findMany({
        where: { id: { in: chunk } },
      });
      const rowsById = new Map(rows.map((org) => [org.id, org]));
      for (const id of chunk) {
        if (limitReached()) break;
        const org = rowsById.get(id);
        if (!org) {
          counts.orgsNotFound++;
          logger.warn("[SFDC backfill] listed org id not found — skipping", {
            orgId: id,
          });
          continue;
        }
        await processOrg(org);
      }
    }
  } else {
    let cursorId = cli.startAfter;
    for (;;) {
      if (limitReached()) break;
      const orgs = await prisma.organization.findMany({
        orderBy: { id: "asc" },
        take: cli.batchSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (orgs.length === 0) break;
      cursorId = orgs[orgs.length - 1].id;
      for (const org of orgs) {
        if (limitReached()) break;
        await processOrg(org);
      }
    }
  }

  // ---- Orphan-user sweep (full run only): Leads for users the org loop
  // cannot see — email set, but no non-NONE membership in a non-excluded org.
  if (!cli.orgId && !cli.orgIdCsvPath) {
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
          organizationMemberships: {
            none: { role: { not: Role.NONE }, ...nonExcludedOrgFilter },
          },
        },
        select: { id: true, email: true, name: true, createdAt: true },
        orderBy: { id: "asc" },
        take,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (users.length === 0) break;
      cursorId = users[users.length - 1].id;
      processed += users.length;

      await mapWithConcurrency(users, cli.concurrency, async (u) => {
        if (!u.email) return;
        const firstEncounter = !leadOutcome.has(u.id);
        const ok = await sendLead({
          id: u.id,
          email: u.email,
          name: u.name,
          createdAt: u.createdAt,
        });
        if (!firstEncounter) return;
        if (ok) counts.orphanLeadsSent++;
        else counts.orphanLeadsFailed++;
      });
      logger.info(
        `[SFDC backfill] orphan-user sweep: ${counts.orphanLeadsSent} leads sent`,
      );
    }
  } else {
    logger.info(
      "[SFDC backfill] scoped run (--org-id/--org-id-csv) — orphan-user sweep skipped",
    );
  }

  logger.info(`[SFDC backfill] done — mode=${mode}`, counts);
  if (retryOrgIds.length > 0) {
    logger.error(
      `[SFDC backfill] ${retryOrgIds.length} orgs had undelivered calls — ` +
        `retry them via --org-id-csv with these ids:\n${retryOrgIds.join("\n")}`,
    );
  }
  if (counts.orphanLeadsFailed > 0) {
    logger.error(
      `[SFDC backfill] ${counts.orphanLeadsFailed} orphan-user leads failed — ` +
        "re-run the full backfill (or grep the [SFDC] error lines) to retry them.",
    );
  }
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
