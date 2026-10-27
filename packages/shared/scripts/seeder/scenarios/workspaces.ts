import { prisma, Role } from "../../../src/db";
import {
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
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
// Several organizations and projects for one user, so organization and
// project navigation (switchers, recent projects, the root redirect) can be
// exercised with a realistic workspace:
//
//  - three organizations with different roles: OWNER (can create projects),
//    ADMIN, and VIEWER (cannot), so role-gated actions show and hide;
//  - six projects, plus one soft-deleted project that must never be listed
//    or opened;
//  - a few small traces per project so project pages are not empty.
// ---------------------------------------------------------------------------

type WorkspaceDef = {
  slug: string;
  name: string;
  role: Role;
  projects: Array<{ slug: string; name: string; isDeleted?: boolean }>;
};

const WORKSPACES: WorkspaceDef[] = [
  {
    slug: "acme",
    name: "Acme Robotics",
    role: Role.OWNER,
    projects: [
      { slug: "support-copilot", name: "support-copilot" },
      { slug: "search-api", name: "search-api" },
      { slug: "eval-sandbox", name: "eval-sandbox" },
      { slug: "legacy-chatbot", name: "legacy-chatbot", isDeleted: true },
    ],
  },
  {
    slug: "northwind",
    name: "Northwind Research",
    role: Role.ADMIN,
    projects: [
      { slug: "rag-pipeline", name: "rag-pipeline" },
      { slug: "agents-staging", name: "agents-staging" },
    ],
  },
  {
    slug: "globex",
    name: "Globex Labs",
    role: Role.VIEWER,
    projects: [{ slug: "chat-prod", name: "chat-prod" }],
  },
];

const TRACE_NAMES = ["answer-question", "summarize-ticket", "plan-and-act"];

const organizationId = (ctx: ScenarioContext, workspace: WorkspaceDef) =>
  `${ctx.idPrefix}-${workspace.slug}`;
const projectId = (
  ctx: ScenarioContext,
  workspace: WorkspaceDef,
  projectSlug: string,
) => `${ctx.idPrefix}-${workspace.slug}-${projectSlug}`;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const tracesPerProject = Number(params["traces-per-project"]);
  const withV4 = params["v4"] === true;
  const userEmail = String(params["user-email"]);
  if (!Number.isInteger(tracesPerProject) || tracesPerProject < 0) {
    throw new SeedError(
      `--traces-per-project must be a non-negative integer, got ${params["traces-per-project"]}`,
    );
  }

  const liveProjects = WORKSPACES.flatMap((workspace) =>
    workspace.projects
      .filter((project) => !project.isDeleted)
      .map((project) => ({ workspace, project })),
  );
  const firstProjectId = projectId(
    ctx,
    liveProjects[0].workspace,
    liveProjects[0].project.slug,
  );
  const links = [
    ...liveProjects.map(
      ({ workspace, project }) =>
        `${ctx.baseUrl}/project/${projectId(ctx, workspace, project.slug)}`,
    ),
    `${ctx.baseUrl}/organizations`,
  ];
  const counts = {
    organizations: WORKSPACES.length,
    projects: liveProjects.length,
    deletedProjects: WORKSPACES.flatMap((w) => w.projects).filter(
      (p) => p.isDeleted,
    ).length,
    traces: liveProjects.length * tracesPerProject,
    observations: liveProjects.length * tracesPerProject,
    events: withV4 ? liveProjects.length * tracesPerProject * 2 : 0,
  };

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

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    throw new SeedError(
      `No user with email ${userEmail}`,
      "run `pnpm --filter=shared run db:seed` or pass --user-email of an existing user",
    );
  }

  ctx.log(
    `writing ${WORKSPACES.length} organizations and ${counts.projects + counts.deletedProjects} projects for ${userEmail}`,
  );
  const dayStart = utcDayStartMs();
  for (const workspace of WORKSPACES) {
    const orgId = organizationId(ctx, workspace);
    await prisma.organization.upsert({
      where: { id: orgId },
      update: { name: workspace.name },
      create: { id: orgId, name: workspace.name },
    });
    await prisma.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      update: { role: workspace.role },
      create: { orgId, userId: user.id, role: workspace.role },
    });
    for (const project of workspace.projects) {
      const id = projectId(ctx, workspace, project.slug);
      const deletedAt = project.isDeleted ? new Date(dayStart) : null;
      await prisma.project.upsert({
        where: { id },
        update: { name: project.name, orgId, deletedAt },
        create: { id, name: project.name, orgId, deletedAt },
      });
    }
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];
  liveProjects.forEach(({ workspace, project }, projectIndex) => {
    const pid = projectId(ctx, workspace, project.slug);
    for (let i = 0; i < tracesPerProject; i++) {
      const index = projectIndex * tracesPerProject + i;
      const timestamp =
        dayStart + 60_000 * (index + 1) + jitter(ctx.seed, index, 30_000);
      const traceId = `${pid}-t${i}`;
      const name = TRACE_NAMES[i % TRACE_NAMES.length];
      const trace = createTrace({
        id: traceId,
        project_id: pid,
        environment: ctx.environment,
        session_id: null,
        timestamp,
        name,
        user_id: `user-${(index % 4) + 1}`,
        tags: ["seed", "workspaces"],
        public: false,
        bookmarked: false,
        metadata: { scenario: "workspaces", project: project.name },
        input: JSON.stringify({
          question: `Request ${i + 1} in ${project.name}`,
        }),
        output: JSON.stringify({ answer: "Done." }),
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });
      const observation = createObservation({
        id: `${traceId}-generation`,
        trace_id: traceId,
        project_id: pid,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: null,
        name: `${name}-llm`,
        start_time: timestamp + 50,
        end_time: timestamp + 850 + jitter(ctx.seed, index, 900),
        completion_start_time: timestamp + 300,
        level: "DEFAULT",
        status_message: null,
        input: JSON.stringify([
          { role: "user", content: `Request ${i + 1} in ${project.name}` },
        ]),
        output: JSON.stringify({ role: "assistant", content: "Done." }),
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
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });
      traces.push(trace);
      observations.push(observation);
      if (withV4) {
        events.push(
          traceToEvent(trace),
          observationToEvent(observation, trace),
        );
      }
    }
  });

  if (traces.length > 0) {
    ctx.log(
      `writing ${traces.length} traces, ${observations.length} generations${withV4 ? `, ${events.length} events` : ""}`,
    );
    await createTracesCh(traces);
    for (const batch of chunk(observations, 1000)) {
      await createObservationsCh(batch);
    }
    for (const batch of chunk(events, 500)) {
      await createEventsCh(batch);
    }
  }

  const organizationIds = WORKSPACES.map((workspace) =>
    organizationId(ctx, workspace),
  );
  const liveProjectIds = liveProjects.map(({ workspace, project }) =>
    projectId(ctx, workspace, project.slug),
  );
  const verified: Record<string, number> = {
    organizations: await prisma.organization.count({
      where: { id: { in: organizationIds } },
    }),
    memberships: await prisma.organizationMembership.count({
      where: { orgId: { in: organizationIds }, userId: user.id },
    }),
    projects: await prisma.project.count({
      where: { id: { in: liveProjectIds }, deletedAt: null },
    }),
    traces:
      traces.length > 0
        ? await countRows(
            "traces",
            "project_id IN {projectIds: Array(String)}",
            { projectIds: liveProjectIds },
            "uniqExact(id)",
          )
        : 0,
  };
  if (withV4 && events.length > 0) {
    verified.events = await countRows(
      "events_full",
      "project_id IN {projectIds: Array(String)}",
      { projectIds: liveProjectIds },
      "uniqExact(span_id)",
    );
  }

  if (
    verified.organizations < WORKSPACES.length ||
    verified.memberships < WORKSPACES.length ||
    verified.projects < liveProjectIds.length
  ) {
    throw new SeedError(
      `Readback mismatch: expected ${WORKSPACES.length} organizations/memberships and ${liveProjectIds.length} projects, found ${verified.organizations}/${verified.memberships} and ${verified.projects}`,
    );
  }
  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
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
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const workspacesScenario: ScenarioDefinition = {
  name: "workspaces",
  description:
    "Three organizations (OWNER, ADMIN, VIEWER) with six projects and one soft-deleted project for one user, plus a few small traces per project. For organization/project switching, recent projects, and the root redirect to the last-used project.",
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
      description: "small traces written to each live project (0 for none)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "also mirror the traces into v4 events_full/events_core",
    },
  ],
  run,
};
