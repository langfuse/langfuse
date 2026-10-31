import { prisma } from "../../../src/db";
import { encrypt } from "../../../src/encryption";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "../../../src/features/rbac/types";
import { createApiKey, getDisplaySecretKey } from "../../../src/server";
import { ScenarioDefinition, SeedError } from "./types";

/**
 * Clean, curated home for docs videos and screenshots: a dedicated org and
 * projects with no test clutter. The other `docs-demo-*` scenarios seed into
 * DOCS_DEMO_PROJECT_ID via `--project docs-demo`.
 */
const DOCS_DEMO_ORG_ID = "docs-demo-org";
export const DOCS_DEMO_PROJECT_ID = "docs-demo";
const DOCS_DEMO_SIBLING_PROJECTS = [
  { id: "docs-demo-research", name: "research-assistant" },
  { id: "docs-demo-voice", name: "voice-agent" },
];
const DOCS_DEMO_API_KEYS = {
  publicKey: "pk-lf-docs-demo",
  secretKey: "sk-lf-docs-demo",
};
/** The user created by `pnpm --filter=shared run db:seed`. */
const DEMO_USER_EMAIL = "demo@langfuse.com";

function summary(
  ctx: Parameters<ScenarioDefinition["run"]>[0],
  startedAt: number,
  projects: number,
  dryRun: boolean,
) {
  return {
    scenario: "docs-demo-project",
    target: "clickhouse" as const,
    params: {},
    projectId: DOCS_DEMO_PROJECT_ID,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts: { organizations: 1, projects },
    verified: {},
    links: [`${ctx.baseUrl}/project/${DOCS_DEMO_PROJECT_ID}`],
    dryRun,
    durationMs: Date.now() - startedAt,
  };
}

export const docsDemoProjectScenario: ScenarioDefinition = {
  name: "docs-demo-project",
  description:
    "Creates the clean 'Acme Corp' org with project 'customer-support' (id docs-demo) plus two sibling projects, makes the demo user OWNER, adds project API keys pk-lf-docs-demo / sk-lf-docs-demo, and — when DOCS_DEMO_LLM_API_KEY is set — an OpenAI-adapter LLM connection (base URL from DOCS_DEMO_LLM_BASE_URL); re-runs remove any other project LLM connection. Run once before the other docs-demo-* scenarios, which take --project docs-demo.",
  supportsV4: false,
  flags: [],
  run: async (ctx) => {
    const startedAt = Date.now();
    const user = await prisma.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });
    if (!user) {
      throw new SeedError(
        `${DEMO_USER_EMAIL} not found`,
        "pnpm --filter=shared run db:seed",
      );
    }
    const projects = [
      { id: DOCS_DEMO_PROJECT_ID, name: "customer-support" },
      ...DOCS_DEMO_SIBLING_PROJECTS,
    ];
    if (ctx.dryRun) {
      return summary(ctx, startedAt, projects.length, true);
    }

    await prisma.organization.upsert({
      where: { id: DOCS_DEMO_ORG_ID },
      update: { name: "Acme Corp" },
      create: {
        id: DOCS_DEMO_ORG_ID,
        name: "Acme Corp",
        cloudConfig: { plan: "Team" },
      },
    });
    for (const project of projects) {
      await prisma.project.upsert({
        where: { id: project.id },
        update: { name: project.name, orgId: DOCS_DEMO_ORG_ID },
        create: { ...project, orgId: DOCS_DEMO_ORG_ID },
      });
    }
    await prisma.organizationMembership.upsert({
      where: { orgId_userId: { orgId: DOCS_DEMO_ORG_ID, userId: user.id } },
      create: { orgId: DOCS_DEMO_ORG_ID, userId: user.id, role: "OWNER" },
      update: { role: "OWNER" },
    });

    const existingKey = await prisma.apiKey.findUnique({
      where: { publicKey: DOCS_DEMO_API_KEYS.publicKey },
    });
    if (!existingKey) {
      await createApiKey(prisma, {
        tenant: OrganizationId(DOCS_DEMO_ORG_ID),
        scope: ProjectId(DOCS_DEMO_PROJECT_ID),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId(user.id),
        name: "docs-demo",
        predefinedKeys: DOCS_DEMO_API_KEYS,
      });
    }

    // Connections a video created (the add-LLM-connection scene saves one)
    // are removed, so every take starts from the same list.
    await prisma.llmApiKeys.deleteMany({
      where: { projectId: DOCS_DEMO_PROJECT_ID, provider: { not: "openai" } },
    });

    // The key only ever comes from the environment, never from this file.
    const llmKey = process.env.DOCS_DEMO_LLM_API_KEY; // eslint-disable-line turbo/no-undeclared-env-vars
    if (llmKey) {
      const baseURL =
        process.env.DOCS_DEMO_LLM_BASE_URL ?? // eslint-disable-line turbo/no-undeclared-env-vars
        null;
      const connection = {
        adapter: "openai",
        secretKey: encrypt(llmKey),
        displaySecretKey: getDisplaySecretKey(llmKey),
        baseURL,
      };
      await prisma.llmApiKeys.upsert({
        where: {
          projectId_provider: {
            projectId: DOCS_DEMO_PROJECT_ID,
            provider: "openai",
          },
        },
        update: connection,
        create: {
          ...connection,
          provider: "openai",
          projectId: DOCS_DEMO_PROJECT_ID,
        },
      });
      ctx.log("LLM connection 'openai' upserted");
    } else {
      ctx.log("DOCS_DEMO_LLM_API_KEY not set; skipping the LLM connection");
    }

    return summary(ctx, startedAt, projects.length, false);
  },
};
