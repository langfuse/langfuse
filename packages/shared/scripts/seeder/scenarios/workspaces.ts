import { hash } from "bcryptjs";
import { prisma, Role, SurveyName } from "../../../src/db";
import {
  convertDateToClickhouseDateTime,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  redis,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows } from "./verify";

// ---------------------------------------------------------------------------
// A realistic multi-organization workspace for organization and project
// navigation: the switcher, the projects overview, and where `/` lands.
//
// Organizations (the demo user is OWNER, ADMIN and VIEWER respectively):
//  - Acme Robotics: hobby plan near its 50k-unit limit, driven by one busy
//    project; a quiet project on an outdated SDK; a project that never
//    received data; a soft-deleted project.
//  - Northwind Research: a busy project with a legacy trace-level
//    evaluator (v4 action needed), a stale project, and one with no traces
//    in the last 30 days.
//  - Globex Labs: one busy project on an old SDK.
//
// Extra users for the landing cases (password `password`), reset on every run:
//  - new.user@example.com: no organization, signup survey not done.
//  - invited.user@example.com: member of two organizations, never opened a
//    project.
//  - returning.user@example.com: last project was deleted.
//  - moved.user@example.com: last project is in an organization they left.
//
// Busy projects carry their usage as v3 rows (10 billable units per trace),
// stamped with their own time like ingestion does, so the billing meter and
// the per-project usage agree. Recent activity is
// anchored to the current UTC hour, so a run in a later hour adds a fresh
// handful of recent traces instead of updating the old ones.
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const UNITS_PER_BULK_TRACE = 10;
const LATEST_PYTHON_SDK = { name: "python", version: "4.3.1" };

type Activity =
  | { kind: "never" }
  | {
      kind: "traces";
      /** When the most recent trace arrived, relative to the run. */
      lastTrace: "recent" | "two-days-ago" | "19-days-ago" | "45-days-ago";
      sdk: { name: string; version: string };
    };

type ProjectPlan = {
  slug: string;
  name: string;
  isDeleted?: true;
  activity: Activity;
  /** Traces that carry the project's billable usage (v3 only). */
  bulkTraces: number;
  legacyTraceEvaluator?: true;
};

type WorkspacePlan = {
  slug: string;
  name: string;
  role: Role;
  billingCycleStartedDaysAgo: number;
  projects: ProjectPlan[];
};

const WORKSPACES: WorkspacePlan[] = [
  {
    slug: "acme",
    name: "Acme Robotics",
    role: Role.OWNER,
    billingCycleStartedDaysAgo: 10,
    projects: [
      {
        slug: "support-copilot",
        name: "support-copilot",
        activity: {
          kind: "traces",
          lastTrace: "recent",
          sdk: LATEST_PYTHON_SDK,
        },
        bulkTraces: 3_800,
      },
      {
        slug: "search-api",
        name: "search-api",
        activity: {
          kind: "traces",
          lastTrace: "two-days-ago",
          sdk: { name: "javascript", version: "3.38.0" },
        },
        bulkTraces: 750,
      },
      {
        slug: "eval-sandbox",
        name: "eval-sandbox",
        activity: { kind: "never" },
        bulkTraces: 0,
      },
      {
        slug: "legacy-chatbot",
        name: "legacy-chatbot",
        isDeleted: true,
        activity: { kind: "never" },
        bulkTraces: 0,
      },
    ],
  },
  {
    slug: "northwind",
    name: "Northwind Research",
    role: Role.ADMIN,
    billingCycleStartedDaysAgo: 3,
    projects: [
      {
        slug: "rag-pipeline",
        name: "rag-pipeline",
        activity: {
          kind: "traces",
          lastTrace: "recent",
          sdk: { name: "python", version: "4.2.0" },
        },
        bulkTraces: 420,
        legacyTraceEvaluator: true,
      },
      {
        slug: "agents-staging",
        name: "agents-staging",
        activity: {
          kind: "traces",
          lastTrace: "19-days-ago",
          sdk: LATEST_PYTHON_SDK,
        },
        bulkTraces: 0,
      },
      {
        slug: "archive-search",
        name: "archive-search",
        activity: {
          kind: "traces",
          lastTrace: "45-days-ago",
          sdk: LATEST_PYTHON_SDK,
        },
        bulkTraces: 0,
      },
    ],
  },
  {
    slug: "globex",
    name: "Globex Labs",
    role: Role.VIEWER,
    billingCycleStartedDaysAgo: 20,
    projects: [
      {
        slug: "chat-prod",
        name: "chat-prod",
        activity: {
          kind: "traces",
          lastTrace: "recent",
          sdk: { name: "python", version: "2.60.1" },
        },
        bulkTraces: 260,
      },
    ],
  },
];

type LandingUserPlan = {
  key: string;
  email: string;
  name: string;
  memberships: Array<{ workspace: string; role: Role }>;
  /** Seeds the per-user last-project record, as the visit beacon would. */
  lastProject: { workspace: string; project: string } | null;
};

const LANDING_USERS: LandingUserPlan[] = [
  {
    key: "new-user",
    email: "new.user@example.com",
    name: "New User",
    memberships: [],
    lastProject: null,
  },
  {
    key: "invited-user",
    email: "invited.user@example.com",
    name: "Invited User",
    memberships: [
      { workspace: "acme", role: Role.MEMBER },
      { workspace: "northwind", role: Role.VIEWER },
    ],
    lastProject: null,
  },
  {
    key: "returning-user",
    email: "returning.user@example.com",
    name: "Returning User",
    memberships: [{ workspace: "acme", role: Role.MEMBER }],
    lastProject: { workspace: "acme", project: "legacy-chatbot" },
  },
  {
    key: "moved-user",
    email: "moved.user@example.com",
    name: "Moved User",
    memberships: [{ workspace: "northwind", role: Role.MEMBER }],
    lastProject: { workspace: "globex", project: "chat-prod" },
  },
];

/** Must match the per-user record the web visit beacon writes. */
const lastVisitedProjectKey = (userId: string) =>
  `langfuse:last-visited-project:${userId}`;
const LAST_VISITED_PROJECT_TTL_SECONDS = 60 * 60 * 24 * 90;

const organizationId = (ctx: ScenarioContext, workspace: string) =>
  `${ctx.idPrefix}-${workspace}`;
const projectId = (ctx: ScenarioContext, workspace: string, project: string) =>
  `${ctx.idPrefix}-${workspace}-${project}`;

const lastTraceTimestamp = (
  lastTrace: Extract<Activity, { kind: "traces" }>["lastTrace"],
  hourStart: number,
  dayStart: number,
): number => {
  if (lastTrace === "recent") return hourStart - 4 * 60 * 1000;
  if (lastTrace === "two-days-ago") return dayStart - 2 * DAY_MS + 9 * HOUR_MS;
  if (lastTrace === "19-days-ago") return dayStart - 19 * DAY_MS + 15 * HOUR_MS;
  return dayStart - 45 * DAY_MS + 11 * HOUR_MS;
};

const TRACE_NAMES = ["answer-question", "summarize-ticket", "plan-and-act"];

const generation = ({
  trace,
  index,
  seed,
}: {
  trace: TraceRecordInsertType;
  index: number;
  seed: number;
}): ObservationRecordInsertType =>
  createObservation({
    id: `${trace.id}-o${index}`,
    trace_id: trace.id,
    project_id: trace.project_id,
    environment: trace.environment,
    type: "GENERATION",
    parent_observation_id: null,
    name: `${trace.name}-llm-${index}`,
    start_time: trace.timestamp + 50 + index * 120,
    end_time: trace.timestamp + 700 + index * 120 + jitter(seed, index, 400),
    completion_start_time: trace.timestamp + 250 + index * 120,
    level: "DEFAULT",
    status_message: null,
    input: JSON.stringify([{ role: "user", content: "Where is my order?" }]),
    output: JSON.stringify({ role: "assistant", content: "It ships today." }),
    provided_model_name: "gpt-4o-mini",
    internal_model_id: null,
    usage_pricing_tier_id: null,
    usage_pricing_tier_name: null,
    provided_usage_details: { input: 120, output: 40 },
    usage_details: { input: 120, output: 40, total: 160 },
    provided_cost_details: {},
    cost_details: {},
    total_cost: null,
    model_parameters: JSON.stringify({ temperature: 0.3 }),
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,
    created_at: trace.created_at,
    updated_at: trace.created_at,
    event_ts: trace.created_at,
  });

const traceRecord = ({
  id,
  pid,
  timestamp,
  name,
  ctx,
  index,
}: {
  id: string;
  pid: string;
  timestamp: number;
  name: string;
  ctx: ScenarioContext;
  index: number;
}): TraceRecordInsertType =>
  createTrace({
    id,
    project_id: pid,
    environment: ctx.environment,
    session_id: null,
    timestamp,
    name,
    user_id: `user-${(index % 4) + 1}`,
    tags: ["seed", "workspaces"],
    public: false,
    bookmarked: false,
    metadata: { scenario: "workspaces" },
    input: JSON.stringify({ question: "Where is my order?" }),
    output: JSON.stringify({ answer: "It ships today." }),
    // Ingestion stamps rows on arrival, which is what usage is metered by.
    created_at: timestamp,
    updated_at: timestamp,
    event_ts: timestamp,
  });

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const recentTraces = Number(params["traces-per-project"]);
  const withV4 = params["v4"] === true;
  const withUsage = params["usage-volume"] === true;
  const withLandingUsers = params["landing-users"] === true;
  const userEmail = String(params["user-email"]);
  if (!Number.isInteger(recentTraces) || recentTraces < 1) {
    throw new SeedError(
      `--traces-per-project must be a positive integer, got ${params["traces-per-project"]}`,
    );
  }

  const allProjects = WORKSPACES.flatMap((workspace) =>
    workspace.projects.map((project) => ({ workspace, project })),
  );
  const liveProjects = allProjects.filter(({ project }) => !project.isDeleted);
  const projectsWithData = liveProjects.filter(
    ({ project }) => project.activity.kind === "traces",
  );
  const linkFor = (workspace: string, project: string) =>
    `${ctx.baseUrl}/project/${projectId(ctx, workspace, project)}`;
  const links = [
    `${ctx.baseUrl}/organizations`,
    ...WORKSPACES.map(
      (workspace) =>
        `${ctx.baseUrl}/organization/${organizationId(ctx, workspace.slug)}`,
    ),
    ...liveProjects.map(({ workspace, project }) =>
      linkFor(workspace.slug, project.slug),
    ),
  ];
  const bulkTraceCount = withUsage
    ? liveProjects.reduce((sum, { project }) => sum + project.bulkTraces, 0)
    : 0;
  const counts = {
    organizations: WORKSPACES.length,
    projects: liveProjects.length,
    deletedProjects: allProjects.length - liveProjects.length,
    landingUsers: withLandingUsers ? LANDING_USERS.length : 0,
    recentTraces: projectsWithData.length * recentTraces,
    bulkTraces: bulkTraceCount,
    events: withV4 ? projectsWithData.length * recentTraces * 2 : 0,
  };
  const firstProjectId = projectId(ctx, "acme", "support-copilot");

  if (ctx.dryRun) {
    return {
      scenario: "workspaces",
      target: "clickhouse",
      params,
      projectId: firstProjectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: [],
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const demoUser = await prisma.user.findUnique({
    where: { email: userEmail },
  });
  if (!demoUser) {
    throw new SeedError(
      `No user with email ${userEmail}`,
      "run `pnpm --filter=shared run db:seed` or pass --user-email of an existing user",
    );
  }

  const dayStart = utcDayStartMs();
  const hourStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

  ctx.log(
    `writing ${WORKSPACES.length} organizations and ${allProjects.length} projects for ${userEmail}`,
  );
  for (const workspace of WORKSPACES) {
    const orgId = organizationId(ctx, workspace.slug);
    const billingCycleAnchor = new Date(
      dayStart - workspace.billingCycleStartedDaysAgo * DAY_MS,
    );
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {
        name: workspace.name,
        cloudBillingCycleAnchor: billingCycleAnchor,
      },
      create: {
        id: orgId,
        name: workspace.name,
        cloudBillingCycleAnchor: billingCycleAnchor,
      },
    });
    await prisma.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId: demoUser.id } },
      update: { role: workspace.role },
      create: { orgId, userId: demoUser.id, role: workspace.role },
    });
    for (const project of workspace.projects) {
      const id = projectId(ctx, workspace.slug, project.slug);
      const data = {
        name: project.name,
        orgId,
        deletedAt: project.isDeleted ? new Date(dayStart) : null,
        hasTraces: project.activity.kind === "traces",
      };
      await prisma.project.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
      const evaluationRuleId = `${id}-legacy-trace-evaluator`;
      if (project.legacyTraceEvaluator) {
        // A trace-level rule on new traces is what v4 asks to migrate; with
        // no evaluator assigned it never runs.
        await prisma.evaluationRule.upsert({
          where: { id: evaluationRuleId },
          update: { status: "ACTIVE", timeScope: ["NEW"] },
          create: {
            id: evaluationRuleId,
            projectId: id,
            name: "helpfulness on new traces",
            status: "ACTIVE",
            targetObject: "trace",
            filter: [],
            sampling: 1,
            delay: 0,
            timeScope: ["NEW"],
          },
        });
      }
    }
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];
  projectsWithData.forEach(({ workspace, project }, projectIndex) => {
    if (project.activity.kind !== "traces") return;
    const pid = projectId(ctx, workspace.slug, project.slug);
    const newest = lastTraceTimestamp(
      project.activity.lastTrace,
      hourStart,
      dayStart,
    );
    for (let i = 0; i < recentTraces; i++) {
      const index = projectIndex * recentTraces + i;
      const trace = traceRecord({
        id: `${pid}-t${i}`,
        pid,
        timestamp: newest - i * 7 * 60 * 1000 - jitter(ctx.seed, index, 60_000),
        name: TRACE_NAMES[i % TRACE_NAMES.length],
        ctx,
        index,
      });
      const observation = generation({
        trace,
        index: 0,
        seed: ctx.seed + index,
      });
      traces.push(trace);
      observations.push(observation);
      if (withV4) {
        // Ingestion attribution is what the v4 readiness check reads.
        const attribution = {
          source: "ingestion-api-dual-write",
          ingestion_sdk_name: project.activity.sdk.name,
          ingestion_sdk_version: project.activity.sdk.version,
        };
        events.push(
          { ...traceToEvent(trace), ...attribution },
          { ...observationToEvent(observation, trace), ...attribution },
        );
      }
    }
  });

  ctx.log(
    `writing ${traces.length} recent traces${withV4 ? ` and ${events.length} events` : ""}`,
  );
  await createTracesCh(traces);
  await createObservationsCh(observations);
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  // Usage volume: written once per project; a re-run would only double count
  // until ClickHouse merges the replaced rows.
  let writtenBulkTraces = 0;
  if (withUsage) {
    for (const { workspace, project } of liveProjects) {
      if (project.bulkTraces === 0) continue;
      const pid = projectId(ctx, workspace.slug, project.slug);
      const existing = await countRows(
        "traces",
        "project_id = {projectId: String} AND startsWith(id, {prefix: String})",
        { projectId: pid, prefix: `${pid}-bulk-` },
        "uniqExact(id)",
      );
      if (existing >= project.bulkTraces) continue;

      // Older than the project's own recent traces, inside the last month.
      const newestBulk =
        project.activity.kind === "traces" &&
        project.activity.lastTrace === "two-days-ago"
          ? dayStart - 3 * DAY_MS
          : dayStart;
      const bulkTraces: TraceRecordInsertType[] = [];
      const bulkObservations: ObservationRecordInsertType[] = [];
      for (let i = 0; i < project.bulkTraces; i++) {
        const trace = traceRecord({
          id: `${pid}-bulk-${i}`,
          pid,
          timestamp:
            newestBulk -
            (i % 6) * DAY_MS -
            jitter(ctx.seed, i, Math.floor(DAY_MS / 2)),
          name: TRACE_NAMES[i % TRACE_NAMES.length],
          ctx,
          index: i,
        });
        bulkTraces.push(trace);
        for (let o = 0; o < UNITS_PER_BULK_TRACE - 1; o++) {
          bulkObservations.push(
            generation({ trace, index: o, seed: ctx.seed + i }),
          );
        }
      }
      ctx.log(
        `writing ${bulkTraces.length} traces and ${bulkObservations.length} observations of usage to ${project.name}`,
      );
      for (const batch of chunk(bulkTraces, 1000)) {
        await createTracesCh(batch);
      }
      for (const batch of chunk(bulkObservations, 2000)) {
        await createObservationsCh(batch);
      }
      writtenBulkTraces += bulkTraces.length;
    }
  }

  // The billing meter, as the hourly usage job would cache it, counted with
  // the metering definition so it matches the per-project usage.
  const meteredUnitsByOrganization: Record<string, number> = {};
  for (const workspace of WORKSPACES) {
    const orgId = organizationId(ctx, workspace.slug);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    const projectIds = workspace.projects
      .filter((project) => !project.isDeleted)
      .map((project) => projectId(ctx, workspace.slug, project.slug));
    const cycleStart = convertDateToClickhouseDateTime(
      organization.cloudBillingCycleAnchor ?? organization.createdAt,
    );
    const where =
      "project_id IN {projectIds: Array(String)} AND created_at >= {start: DateTime64(3)}";
    const units =
      (await countRows("traces", where, { projectIds, start: cycleStart })) +
      (await countRows("observations", where, {
        projectIds,
        start: cycleStart,
      }));
    meteredUnitsByOrganization[workspace.slug] = units;
    await prisma.organization.update({
      where: { id: orgId },
      data: { cloudCurrentCycleUsage: units },
    });
  }

  if (withLandingUsers) {
    ctx.log(`resetting ${LANDING_USERS.length} users for the landing cases`);
    const password = await hash("password", 12);
    for (const plan of LANDING_USERS) {
      const user = await prisma.user.upsert({
        where: { email: plan.email },
        update: { name: plan.name, password, v4BetaEnabled: true },
        create: {
          id: `${ctx.idPrefix}-${plan.key}`,
          email: plan.email,
          name: plan.name,
          password,
          v4BetaEnabled: true,
        },
      });
      await prisma.organizationMembership.deleteMany({
        where: { userId: user.id },
      });
      await prisma.survey.deleteMany({
        where: { userId: user.id, surveyName: SurveyName.USER_ONBOARDING },
      });
      for (const membership of plan.memberships) {
        await prisma.organizationMembership.create({
          data: {
            orgId: organizationId(ctx, membership.workspace),
            userId: user.id,
            role: membership.role,
          },
        });
      }
      const key = lastVisitedProjectKey(user.id);
      if (plan.lastProject) {
        await redis?.set(
          key,
          projectId(ctx, plan.lastProject.workspace, plan.lastProject.project),
          "EX",
          LAST_VISITED_PROJECT_TTL_SECONDS,
        );
      } else {
        await redis?.del(key);
      }
    }
  }

  const organizationIds = WORKSPACES.map((workspace) =>
    organizationId(ctx, workspace.slug),
  );
  const liveProjectIds = liveProjects.map(({ workspace, project }) =>
    projectId(ctx, workspace.slug, project.slug),
  );
  const verified: Record<string, number> = {
    organizations: await prisma.organization.count({
      where: { id: { in: organizationIds } },
    }),
    memberships: await prisma.organizationMembership.count({
      where: { orgId: { in: organizationIds }, userId: demoUser.id },
    }),
    projects: await prisma.project.count({
      where: { id: { in: liveProjectIds }, deletedAt: null },
    }),
    landingUsers: withLandingUsers
      ? await prisma.user.count({
          where: { email: { in: LANDING_USERS.map((user) => user.email) } },
        })
      : 0,
    recentTraces: await countRows(
      "traces",
      "project_id IN {projectIds: Array(String)} AND id IN {traceIds: Array(String)}",
      { projectIds: liveProjectIds, traceIds: traces.map((trace) => trace.id) },
      "uniqExact(id)",
    ),
    acmeMeteredUnits: meteredUnitsByOrganization.acme ?? 0,
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      "project_id IN {projectIds: Array(String)} AND trace_id IN {traceIds: Array(String)}",
      { projectIds: liveProjectIds, traceIds: traces.map((trace) => trace.id) },
      "uniqExact(span_id)",
    );
  }

  if (
    verified.organizations < WORKSPACES.length ||
    verified.memberships < WORKSPACES.length ||
    verified.projects < liveProjectIds.length ||
    verified.landingUsers < counts.landingUsers
  ) {
    throw new SeedError(
      `Readback mismatch: expected ${WORKSPACES.length} organizations/memberships, ${liveProjectIds.length} projects and ${counts.landingUsers} users, found ${verified.organizations}/${verified.memberships}, ${verified.projects} and ${verified.landingUsers}`,
    );
  }
  if (verified.recentTraces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} recent traces, found ${verified.recentTraces}`,
    );
  }
  if (withV4 && (verified.events ?? 0) < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "workspaces",
    target: "clickhouse",
    params,
    projectId: firstProjectId,
    environment: ctx.environment,
    traceIds: traces.map((trace) => trace.id),
    sessionIds: [],
    counts: { ...counts, bulkTracesWritten: writtenBulkTraces },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const workspacesScenario: ScenarioDefinition = {
  name: "workspaces",
  description:
    "Three organizations (OWNER, ADMIN, VIEWER) whose projects cover every overview state: receiving, quiet, stale, inactive, never ingested and deleted; v4 ready vs outdated SDK vs legacy evaluator; and a hobby organization near its usage limit. Also resets four users for the landing cases (no organization, just invited, last project deleted, last project access lost; password `password`).",
  supportsV4: true,
  flags: [
    {
      flag: "user-email",
      type: "string",
      default: "demo@langfuse.com",
      description: "existing user who becomes a member of every organization",
    },
    {
      flag: "traces-per-project",
      type: "number",
      default: 3,
      description: "recent traces written to each project that has data",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "also mirror recent traces into v4 events with SDK attribution (v4 readiness)",
    },
    {
      flag: "usage-volume",
      type: "boolean",
      default: true,
      description:
        "write the billable usage (~46k units in Acme Robotics) once per project",
    },
    {
      flag: "landing-users",
      type: "boolean",
      default: true,
      description: "reset the four example.com users for the landing cases",
    },
  ],
  run,
};
