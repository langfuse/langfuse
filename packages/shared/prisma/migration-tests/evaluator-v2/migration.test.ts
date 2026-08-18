import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  EvaluatorBlockReason,
  JobConfigState,
  JobExecutionStatus,
  JobType,
  PrismaClient,
} from "@prisma/client";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const scriptDirectory = __dirname;
const prismaDirectory = join(scriptDirectory, "..", "..");
const sharedDirectory = join(prismaDirectory, "..");
const preparatoryMigration = join(
  prismaDirectory,
  "migrations",
  "20260807120000_drop_job_execution_configuration_fk",
  "migration.sql",
);
// The evaluator v2 rollout is two migrations: the DDL creates the tables and their foreign keys,
// and the backfill copies the legacy rows in. They are split so that the foreign keys, which lock
// `projects` and `users` against writes while their transaction is open, do not hold that lock for
// the duration of the backfill. Both must exist for this suite to be testing anything.
const ddlMigration = join(
  prismaDirectory,
  "migrations",
  "20260807121000_add_evaluator_v2",
  "migration.sql",
);
const backfillMigration = join(
  prismaDirectory,
  "migrations",
  "20260807121500_backfill_evaluator_v2",
  "migration.sql",
);
const preparatoryMigrationName = basename(dirname(preparatoryMigration));
const existingDatabaseUrl = process.env.EVALUATOR_V2_MIGRATION_DATABASE_URL;
const configuredDatabaseUrl = process.env.DATABASE_URL;
const databaseName = `langfuse_evaluator_migration_${Date.now()}_${process.pid}`;
const temporaryPrismaDirectory = mkdtempSync(
  join(tmpdir(), "langfuse-evaluator-migration."),
);

const shadowDatabaseName = `${databaseName}_shadow`;

let databaseCreated = false;
let shadowDatabaseCreated = false;
let prisma: PrismaClient;
let databaseUrl: URL;
let secondDeployOutput = "";
let schemaDrift = "";

function stage(message: string) {
  process.stdout.write(`[migration setup] ${message}\n`);
}

function run(command: string, args: string[], cwd = sharedDirectory) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        result.stdout,
        result.stderr,
        result.error?.message,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result.stdout;
}

function applyMigrations(schemaPath: string) {
  return run(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--schema", schemaPath],
    sharedDirectory,
  );
}

// `prisma migrate deploy` only compares the recorded migration names, so it cannot see a
// hand-written migration that drifted from schema.prisma. Replaying the migrations into a throwaway
// shadow database and diffing them against the model does. This is what catches an identifier
// Postgres silently truncates to 63 characters while Prisma expects its own truncation.
function diffMigrationsAgainstSchema(shadowUrl: string) {
  return run("pnpm", [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "./prisma/migrations",
    "--to-schema-datamodel",
    "./prisma/schema.prisma",
    "--shadow-database-url",
    shadowUrl,
    "--script",
  ]);
}

async function executeAdminSql(sql: string) {
  const adminUrl = new URL(configuredDatabaseUrl!);
  adminUrl.pathname = "/postgres";
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  });

  try {
    await adminPrisma.$executeRawUnsafe(sql);
  } finally {
    await adminPrisma.$disconnect();
  }
}

async function seedFixture(legacyPrisma: PrismaClient) {
  await legacyPrisma.organization.create({
    data: {
      id: "evaluator-v2-migration-org",
      name: "Evaluator v2 migration test",
    },
  });
  await legacyPrisma.project.createMany({
    data: [
      {
        id: "project-a",
        orgId: "evaluator-v2-migration-org",
        name: "Project A",
      },
      {
        id: "project-b",
        orgId: "evaluator-v2-migration-org",
        name: "Project B",
      },
    ],
  });
  await legacyPrisma.evalTemplate.createMany({
    data: [
      {
        id: "quality-v1",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
        projectId: "project-a",
        name: "Quality",
        version: 1,
        prompt: "prompt-v1",
        type: EvalTemplateType.LLM_AS_JUDGE,
        modelParams: { temperature: 0 },
        vars: ["input"],
        outputDefinition: { type: "numeric" },
      },
      {
        id: "quality-v2",
        createdAt: new Date("2025-02-01"),
        updatedAt: new Date("2025-02-01"),
        projectId: "project-a",
        name: "Quality",
        version: 2,
        type: EvalTemplateType.CODE,
        vars: ["input"],
        outputDefinition: { type: "boolean" },
        sourceCode: "return true;",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      },
      {
        id: "quality-other-project",
        createdAt: new Date("2025-03-01"),
        updatedAt: new Date("2025-03-01"),
        projectId: "project-b",
        name: "Quality",
        version: 1,
        prompt: "other-project",
        type: EvalTemplateType.LLM_AS_JUDGE,
      },
      {
        id: "unattached-v1",
        createdAt: new Date("2025-01-10"),
        updatedAt: new Date("2025-01-10"),
        projectId: "project-a",
        name: "Unattached",
        version: 1,
        prompt: "unattached-v1",
        type: EvalTemplateType.LLM_AS_JUDGE,
      },
      {
        id: "unattached-v2",
        createdAt: new Date("2025-02-10"),
        updatedAt: new Date("2025-02-10"),
        projectId: "project-a",
        name: "Unattached",
        version: 2,
        type: EvalTemplateType.CODE,
        sourceCode: "return false;",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      },
      {
        id: "managed-used-v1",
        createdAt: new Date("2025-01-15"),
        updatedAt: new Date("2025-01-15"),
        name: "Managed used",
        version: 1,
        prompt: "managed",
        type: EvalTemplateType.LLM_AS_JUDGE,
        vars: ["output"],
      },
      {
        id: "managed-used-duplicate",
        createdAt: new Date("2025-01-17"),
        updatedAt: new Date("2025-01-17"),
        name: "Managed used",
        version: 1,
        prompt: "unreferenced duplicate",
        type: EvalTemplateType.CODE,
        vars: ["output"],
        sourceCode: "return false;",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      },
      {
        id: "managed-unused-v1",
        createdAt: new Date("2025-01-16"),
        updatedAt: new Date("2025-01-16"),
        name: "Managed unused",
        version: 1,
        prompt: "managed-unused",
        type: EvalTemplateType.LLM_AS_JUDGE,
      },
    ],
  });
  await legacyPrisma.jobConfiguration.createMany({
    data: [
      {
        id: "rule-current",
        createdAt: new Date("2025-04-01"),
        updatedAt: new Date("2025-04-02"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        blockedAt: new Date("2025-04-03"),
        blockReason: EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE,
        blockMessage: "model unavailable",
        evalTemplateId: "quality-v2",
        scoreName: "Quality score",
        filter: [],
        targetObject: "observation",
        variableMapping: { input: "input" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-old",
        createdAt: new Date("2025-04-04"),
        updatedAt: new Date("2025-04-04"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "quality-v1",
        scoreName: "Old quality score",
        filter: [],
        targetObject: "trace",
        variableMapping: { input: "output" },
        sampling: 0.5,
        delay: 1000,
        timeScope: ["EXISTING"],
      },
      {
        id: "rule-managed",
        createdAt: new Date("2025-04-05"),
        updatedAt: new Date("2025-04-05"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "managed-used-v1",
        scoreName: "Managed score",
        filter: [],
        targetObject: "observation",
        variableMapping: { output: "output" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-managed-second",
        createdAt: new Date("2025-04-05T01:00:00Z"),
        updatedAt: new Date("2025-04-05T01:00:00Z"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "managed-used-v1",
        scoreName: "Managed score second",
        filter: [],
        targetObject: "dataset",
        variableMapping: { output: "input" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-managed-other-project",
        createdAt: new Date("2025-04-05T02:00:00Z"),
        updatedAt: new Date("2025-04-05T02:00:00Z"),
        projectId: "project-b",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "managed-used-v1",
        scoreName: "Managed score other project",
        filter: [],
        targetObject: "observation",
        variableMapping: { output: "trace" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        // same project, template and mapping as `rule-managed`, but a different score name, so it
        // must keep its own evaluator and block state.
        id: "rule-managed-duplicate",
        createdAt: new Date("2025-04-05T03:00:00Z"),
        updatedAt: new Date("2025-04-05T04:00:00Z"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        blockedAt: new Date("2025-04-08"),
        blockReason: EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE,
        blockMessage: "duplicate blocked later",
        evalTemplateId: "managed-used-v1",
        scoreName: "Managed score duplicate",
        filter: [],
        targetObject: "observation",
        variableMapping: { output: "output" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        // same mapping as `rule-key-order-b` but written with the keys in the other order.
        // jsonb normalises key order, so the two must still collapse into one evaluator.
        id: "rule-key-order-a",
        createdAt: new Date("2025-04-09"),
        updatedAt: new Date("2025-04-09"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "quality-v2",
        scoreName: "Key order A",
        filter: [],
        targetObject: "observation",
        variableMapping: { input: "input", output: "output" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-key-order-b",
        createdAt: new Date("2025-04-10"),
        updatedAt: new Date("2025-04-10"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "quality-v2",
        scoreName: "Key order A",
        filter: [],
        targetObject: "observation",
        variableMapping: { output: "output", input: "input" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-unused",
        createdAt: new Date("2025-04-06"),
        updatedAt: new Date("2025-04-06"),
        projectId: "project-a",
        jobType: JobType.EVAL,
        status: JobConfigState.INACTIVE,
        scoreName: "Unused score",
        filter: [],
        targetObject: "observation",
        variableMapping: {},
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
      {
        id: "rule-other-project",
        createdAt: new Date("2025-04-07"),
        updatedAt: new Date("2025-04-07"),
        projectId: "project-b",
        jobType: JobType.EVAL,
        status: JobConfigState.ACTIVE,
        evalTemplateId: "quality-other-project",
        scoreName: "Other project quality",
        filter: [],
        targetObject: "observation",
        variableMapping: { input: "input" },
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
    ],
  });
  await legacyPrisma.jobExecution.create({
    data: {
      id: "execution-current",
      projectId: "project-a",
      jobConfigurationId: "rule-current",
      jobTemplateId: "quality-v2",
      status: JobExecutionStatus.PENDING,
    },
  });
}

async function prepareProjects(legacyPrisma: PrismaClient) {
  const [templateProjects, configurationProjects] = await Promise.all([
    legacyPrisma.evalTemplate.findMany({
      where: { projectId: { not: null } },
      distinct: ["projectId"],
      select: { projectId: true },
    }),
    legacyPrisma.jobConfiguration.findMany({
      distinct: ["projectId"],
      select: { projectId: true },
    }),
  ]);
  const projectIds = [
    ...new Set(
      [...templateProjects, ...configurationProjects].flatMap(
        ({ projectId }) => (projectId ? [projectId] : []),
      ),
    ),
  ];

  expect(
    projectIds.length,
    "Migration tests require at least two project IDs",
  ).toBeGreaterThanOrEqual(2);
  await legacyPrisma.organization.upsert({
    where: { id: "evaluator-v2-migration-org" },
    create: {
      id: "evaluator-v2-migration-org",
      name: "Evaluator v2 migration test",
    },
    update: {},
  });
  await legacyPrisma.project.createMany({
    data: projectIds.map((projectId) => ({
      id: projectId,
      orgId: "evaluator-v2-migration-org",
      name: `Evaluator migration project ${projectId}`,
    })),
    skipDuplicates: true,
  });
}

beforeAll(async () => {
  stage("checking prerequisites");
  expect(databaseName).toMatch(/^langfuse_evaluator_migration_[0-9_]+$/);
  expect(
    existsSync(preparatoryMigration),
    `Missing migration: ${preparatoryMigration}`,
  ).toBe(true);
  expect(existsSync(ddlMigration), `Missing migration: ${ddlMigration}`).toBe(
    true,
  );
  expect(
    existsSync(backfillMigration),
    `Missing migration: ${backfillMigration}`,
  ).toBe(true);
  expect(
    existingDatabaseUrl ?? configuredDatabaseUrl,
    "DATABASE_URL or EVALUATOR_V2_MIGRATION_DATABASE_URL must be configured",
  ).toBeTruthy();

  if (existingDatabaseUrl) {
    databaseUrl = new URL(existingDatabaseUrl);
    expect(
      databaseUrl.pathname,
      "Refusing to migrate the postgres admin database",
    ).not.toBe("/postgres");
    stage(`using pre-populated database ${databaseUrl.pathname.slice(1)}`);
  } else {
    databaseUrl = new URL(configuredDatabaseUrl!);
    databaseUrl.pathname = `/${databaseName}`;
    await executeAdminSql(
      `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
    );
    databaseCreated = true;
    stage(`created ${databaseName}`);

    const temporaryMigrationsDirectory = join(
      temporaryPrismaDirectory,
      "migrations",
    );
    mkdirSync(temporaryMigrationsDirectory);
    cpSync(
      join(prismaDirectory, "schema.prisma"),
      join(temporaryPrismaDirectory, "schema.prisma"),
    );
    cpSync(
      join(prismaDirectory, "migrations", "migration_lock.toml"),
      join(temporaryMigrationsDirectory, "migration_lock.toml"),
    );

    for (const migration of readdirSync(join(prismaDirectory, "migrations"), {
      withFileTypes: true,
    })
      .filter(
        (entry) => entry.isDirectory() && entry.name < preparatoryMigrationName,
      )
      .sort((left, right) => left.name.localeCompare(right.name))) {
      cpSync(
        join(prismaDirectory, "migrations", migration.name),
        join(temporaryMigrationsDirectory, migration.name),
        { recursive: true },
      );
    }
  }

  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.DIRECT_URL = databaseUrl.toString();
  process.env.DISABLE_ERD = "true";

  if (!existingDatabaseUrl) {
    stage("applying migrations before the migration under test");
    applyMigrations(join(temporaryPrismaDirectory, "schema.prisma"));
    stage("loading the checked-in fixture");
  }
  const legacyPrisma = new PrismaClient();
  await legacyPrisma.$connect();
  try {
    if (!existingDatabaseUrl) {
      await seedFixture(legacyPrisma);
    }
    await prepareProjects(legacyPrisma);
  } finally {
    await legacyPrisma.$disconnect();
  }
  stage("applying the migration under test and all later migrations");
  applyMigrations(join(prismaDirectory, "schema.prisma"));
  stage("rerunning prisma migrate deploy");
  secondDeployOutput = applyMigrations(join(prismaDirectory, "schema.prisma"));

  if (configuredDatabaseUrl) {
    stage("diffing the migrations against schema.prisma");
    const shadowUrl = new URL(databaseUrl.toString());
    shadowUrl.pathname = `/${shadowDatabaseName}`;
    await executeAdminSql(
      `CREATE DATABASE "${shadowDatabaseName}" TEMPLATE template0`,
    );
    shadowDatabaseCreated = true;
    schemaDrift = diffMigrationsAgainstSchema(shadowUrl.toString());
  }

  prisma = new PrismaClient();
  await prisma.$connect();
  stage("database ready; starting assertions");
});

afterAll(async () => {
  await prisma?.$disconnect();
  try {
    if (shadowDatabaseCreated) {
      stage(`dropping ${shadowDatabaseName}`);
      await executeAdminSql(
        `DROP DATABASE IF EXISTS "${shadowDatabaseName}" WITH (FORCE)`,
      );
    }
    if (databaseCreated) {
      stage(`dropping ${databaseName}`);
      await executeAdminSql(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    }
  } finally {
    if (temporaryPrismaDirectory.includes("langfuse-evaluator-migration.")) {
      rmSync(temporaryPrismaDirectory, { recursive: true, force: true });
    }
  }
});

describe("evaluator v2 migration schema", () => {
  it("creates the intended evaluator and rule access paths", async () => {
    const [indexes, versionColumns] = await Promise.all([
      prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('evaluators', 'evaluator_versions', 'evaluation_rules')
      `,
      prisma.$queryRaw<Array<{ column_name: string; udt_name: string }>>`
        SELECT column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'evaluator_versions'
      `,
    ]);
    const indexesByName = new Map(
      indexes.map(({ indexname, indexdef }) => [indexname, indexdef]),
    );
    const versionColumnsByName = new Map(
      versionColumns.map(({ column_name, udt_name }) => [
        column_name,
        udt_name,
      ]),
    );

    expect(indexesByName.get("evaluators_project_id_created_at_idx")).toContain(
      "(project_id, created_at DESC)",
    );
    expect(
      indexesByName.get("evaluation_rules_project_id_updated_at_idx"),
    ).toContain("(project_id, updated_at DESC)");
    expect(
      indexesByName.get("evaluator_versions_evaluator_id_version_key"),
    ).toContain("(evaluator_id, version DESC)");
    expect([...indexesByName.keys()]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("created_by_user_id")]),
    );
    expect(versionColumnsByName.has("updated_at")).toBe(false);
    expect(versionColumnsByName.get("source_code_language")).toBe(
      "EvaluatorSourceCodeLanguage",
    );
  });

  it("drops only the job configuration foreign key and preserves executions", async () => {
    const [jobConfigurationForeignKey] = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT count(*)::bigint AS count
      FROM pg_constraint
      WHERE conname = 'job_executions_job_configuration_id_fkey'
    `;

    expect(Number(jobConfigurationForeignKey?.count)).toBe(0);

    if (!existingDatabaseUrl) {
      await expect(
        prisma.jobExecution.findUnique({ where: { id: "execution-current" } }),
      ).resolves.toMatchObject({
        projectId: "project-a",
        jobConfigurationId: "rule-current",
      });
    }
  });

  it("has no pending migrations when prisma migrate deploy runs again", () => {
    expect(secondDeployOutput).toContain("No pending migrations to apply.");
  });

  it.runIf(configuredDatabaseUrl)(
    "leaves no drift between the migrations and schema.prisma",
    () => {
      // A drifted identifier only shows up here: `migrate deploy` compares migration names, and
      // the failure message is the DDL Prisma would need to reconcile the two.
      expect(schemaDrift).toContain("This is an empty migration.");
    },
  );
});

if (existingDatabaseUrl) {
  // These run against an arbitrary restored dump, so there are no known-good values to write down
  // and the expectations have to be derived from the source tables. Keep them counting the source
  // data rather than re-deriving it the way the migration does, or they stop being a check. The
  // fixture suite below is where the exact expected rows live.
  describe("pre-populated database invariants", () => {
    it("migrates every legacy rule", async () => {
      const [jobConfigurations, rules] = await Promise.all([
        // the migration only copies EVAL configurations, so the invariant has to as well
        prisma.jobConfiguration.count({ where: { jobType: JobType.EVAL } }),
        prisma.evaluationRule.count(),
      ]);

      expect(rules).toBe(jobConfigurations);
    });

    it("creates assignments only for configurations with templates", async () => {
      const [configurationsWithTemplates, assignments] = await Promise.all([
        prisma.jobConfiguration.count({
          where: { jobType: JobType.EVAL, evalTemplateId: { not: null } },
        }),
        prisma.evaluationRuleEvaluatorAssignment.count(),
      ]);

      expect(assignments).toBe(configurationsWithTemplates);
    });

    it("creates one evaluator per project, template, variable mapping and score name", async () => {
      // score_name belongs in the key: it is what the worker writes as the score name, so two
      // configurations that agree on project, template and mapping but disagree on score name are
      // different evaluators. Omitting it here passes on fixtures that never vary score name
      // within a group, but understates the expectation on real data, where a single project
      // routinely runs one template under many score names.
      const [counts] = await prisma.$queryRaw<
        Array<{ expected: bigint; actual: bigint }>
      >`
        SELECT
          (
            SELECT count(DISTINCT (project_id, eval_template_id, variable_mapping, score_name))
            FROM job_configurations
            WHERE job_type = 'EVAL' AND eval_template_id IS NOT NULL
          )::bigint AS expected,
          (
            SELECT count(DISTINCT evaluator_id)
            FROM evaluation_rule_evaluator_assignments
          )::bigint AS actual
      `;

      expect(Number(counts?.actual)).toBe(Number(counts?.expected));
    });

    it("keeps a version matching the template every rule pointed at", async () => {
      // the version cap means a rule's evaluator must still carry the exact template version
      // that rule was running, otherwise the migration silently changed what it evaluates
      const [missing] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM job_configurations jc
        JOIN eval_templates t
          ON t.id = jc.eval_template_id
        JOIN evaluation_rule_evaluator_assignments a
          ON a.evaluation_rule_id = jc.id
        LEFT JOIN evaluator_versions ev
          ON ev.evaluator_id = a.evaluator_id AND ev.version = t.version
        WHERE jc.job_type = 'EVAL' AND ev.id IS NULL
      `;

      expect(Number(missing?.count)).toBe(0);
    });

    it("stores assignment mappings only for legacy-target rules", async () => {
      const [mismatched] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM job_configurations jc
        JOIN evaluation_rule_evaluator_assignments a
          ON a.evaluation_rule_id = jc.id
        WHERE jc.job_type = 'EVAL'
          AND (
            (
              jc.target_object IN ('trace', 'dataset')
              AND a.variable_mapping IS DISTINCT FROM jc.variable_mapping
            )
            OR (
              jc.target_object NOT IN ('trace', 'dataset')
              AND a.variable_mapping IS NOT NULL
            )
          )
      `;

      expect(Number(mismatched?.count)).toBe(0);
    });

    it("disables rules that do not run on new data", async () => {
      const [activeHistoricalRules] = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`
        SELECT count(*)::bigint AS count
        FROM job_configurations jc
        JOIN evaluation_rules er ON er.id = jc.id
        WHERE jc.job_type = 'EVAL'
          AND NOT ('NEW' = ANY(COALESCE(jc.time_scope, ARRAY[]::TEXT[])))
          AND er.status <> 'INACTIVE'
      `;

      expect(Number(activeHistoricalRules?.count)).toBe(0);
    });
  });
} else {
  describe("checked-in edge-case fixture", () => {
    it("migrates the expected rules", async () => {
      const rules = await prisma.evaluationRule.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          projectId: true,
          createdByUserId: true,
          name: true,
          status: true,
        },
      });

      // every job configuration keeps its own rule, including the ones that now share an evaluator
      expect(rules).toEqual([
        {
          id: "rule-current",
          projectId: "project-a",
          createdByUserId: null,
          name: "Quality score",
          status: "ACTIVE",
        },
        {
          id: "rule-key-order-a",
          projectId: "project-a",
          createdByUserId: null,
          name: "Key order A",
          status: "ACTIVE",
        },
        {
          id: "rule-key-order-b",
          projectId: "project-a",
          createdByUserId: null,
          name: "Key order A",
          status: "ACTIVE",
        },
        {
          id: "rule-managed",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score",
          status: "ACTIVE",
        },
        {
          id: "rule-managed-duplicate",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score duplicate",
          status: "ACTIVE",
        },
        {
          id: "rule-managed-other-project",
          projectId: "project-b",
          createdByUserId: null,
          name: "Managed score other project",
          status: "ACTIVE",
        },
        {
          id: "rule-managed-second",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score second",
          status: "ACTIVE",
        },
        {
          id: "rule-old",
          projectId: "project-a",
          createdByUserId: null,
          name: "Old quality score",
          status: "INACTIVE",
        },
        {
          id: "rule-other-project",
          projectId: "project-b",
          createdByUserId: null,
          name: "Other project quality",
          status: "ACTIVE",
        },
        {
          id: "rule-unused",
          projectId: "project-a",
          createdByUserId: null,
          name: "Unused score",
          status: "INACTIVE",
        },
      ]);
    });

    it("migrates exactly the expected evaluators", async () => {
      const evaluators = await prisma.evaluator.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          projectId: true,
          createdByUserId: true,
          name: true,
          type: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          blockedAt: true,
          blockReason: true,
          blockMessage: true,
        },
      });

      // Nine job configurations reference a template but only eight evaluators come out of them:
      // `rule-key-order-b` folds into `rule-key-order-a`. Despite sharing a template and mapping,
      // `rule-managed-duplicate` stays separate because its score name differs. `unattached-v2`
      // is the ninth evaluator, from the template family no rule uses.
      expect(evaluators).toEqual([
        {
          id: "rule-current",
          projectId: "project-a",
          createdByUserId: null,
          name: "Quality score",
          type: "CODE",
          description: null,
          createdAt: new Date("2025-04-01"),
          updatedAt: new Date("2025-04-02"),
          blockedAt: new Date("2025-04-03"),
          blockReason: "EVAL_MODEL_UNAVAILABLE",
          blockMessage: "model unavailable",
        },
        {
          // merged from rule-key-order-a and rule-key-order-b: same mapping, different key order.
          // createdAt is the group minimum, updatedAt the maximum, the name the representative's.
          id: "rule-key-order-a",
          projectId: "project-a",
          createdByUserId: null,
          name: "Key order A",
          type: "CODE",
          description: null,
          createdAt: new Date("2025-04-09"),
          updatedAt: new Date("2025-04-10"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          id: "rule-managed",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-05T00:00:00Z"),
          updatedAt: new Date("2025-04-05T00:00:00Z"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          // Same project, template and mapping as rule-managed, but a different score name.
          id: "rule-managed-duplicate",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score duplicate",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-05T03:00:00Z"),
          updatedAt: new Date("2025-04-05T04:00:00Z"),
          blockedAt: new Date("2025-04-08"),
          blockReason: "EVAL_MODEL_UNAVAILABLE",
          blockMessage: "duplicate blocked later",
        },
        {
          // same template and mapping as rule-managed but another project, so not merged
          id: "rule-managed-other-project",
          projectId: "project-b",
          createdByUserId: null,
          name: "Managed score other project",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-05T02:00:00Z"),
          updatedAt: new Date("2025-04-05T02:00:00Z"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          // same template and project as rule-managed but another mapping, so not merged
          id: "rule-managed-second",
          projectId: "project-a",
          createdByUserId: null,
          name: "Managed score second",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-05T01:00:00Z"),
          updatedAt: new Date("2025-04-05T01:00:00Z"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          id: "rule-old",
          projectId: "project-a",
          createdByUserId: null,
          name: "Old quality score",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-04"),
          updatedAt: new Date("2025-04-04"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          id: "rule-other-project",
          projectId: "project-b",
          createdByUserId: null,
          name: "Other project quality",
          type: "LLM_AS_JUDGE",
          description: null,
          createdAt: new Date("2025-04-07"),
          updatedAt: new Date("2025-04-07"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
        {
          id: "unattached-v2",
          projectId: "project-a",
          createdByUserId: null,
          name: "Unattached",
          type: "CODE",
          description: null,
          createdAt: new Date("2025-02-10"),
          updatedAt: new Date("2025-02-10"),
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
        },
      ]);
    });

    it("migrates exactly the expected evaluator versions", async () => {
      const versions = await prisma.evaluatorVersion.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          evaluatorId: true,
          version: true,
          createdByUserId: true,
          prompt: true,
          vars: true,
          modelParams: true,
          outputDefinition: true,
          variableMapping: true,
          sourceCode: true,
          sourceCodeLanguage: true,
        },
      });

      // a merged evaluator carries the version history once, not once per rule
      expect(versions).toEqual([
        {
          id: "rule-current:quality-v1",
          evaluatorId: "rule-current",
          version: 1,
          createdByUserId: null,
          prompt: "prompt-v1",
          vars: ["input"],
          modelParams: { temperature: 0 },
          outputDefinition: { type: "numeric" },
          variableMapping: null,
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-current:quality-v2",
          evaluatorId: "rule-current",
          version: 2,
          createdByUserId: null,
          prompt: null,
          vars: ["input"],
          modelParams: null,
          outputDefinition: { type: "boolean" },
          variableMapping: { input: "input" },
          sourceCode: "return true;",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        {
          id: "rule-key-order-a:quality-v1",
          evaluatorId: "rule-key-order-a",
          version: 1,
          createdByUserId: null,
          prompt: "prompt-v1",
          vars: ["input"],
          modelParams: { temperature: 0 },
          outputDefinition: { type: "numeric" },
          variableMapping: null,
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-key-order-a:quality-v2",
          evaluatorId: "rule-key-order-a",
          version: 2,
          createdByUserId: null,
          prompt: null,
          vars: ["input"],
          modelParams: null,
          outputDefinition: { type: "boolean" },
          variableMapping: { input: "input", output: "output" },
          sourceCode: "return true;",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        {
          id: "rule-managed-duplicate:managed-used-v1",
          evaluatorId: "rule-managed-duplicate",
          version: 1,
          createdByUserId: null,
          prompt: "managed",
          vars: ["output"],
          modelParams: null,
          outputDefinition: null,
          variableMapping: { output: "output" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-managed:managed-used-v1",
          evaluatorId: "rule-managed",
          version: 1,
          createdByUserId: null,
          prompt: "managed",
          vars: ["output"],
          modelParams: null,
          outputDefinition: null,
          variableMapping: { output: "output" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-managed-other-project:managed-used-v1",
          evaluatorId: "rule-managed-other-project",
          version: 1,
          createdByUserId: null,
          prompt: "managed",
          vars: ["output"],
          modelParams: null,
          outputDefinition: null,
          variableMapping: { output: "trace" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-managed-second:managed-used-v1",
          evaluatorId: "rule-managed-second",
          version: 1,
          createdByUserId: null,
          prompt: "managed",
          vars: ["output"],
          modelParams: null,
          outputDefinition: null,
          variableMapping: { output: "input" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-old:quality-v1",
          evaluatorId: "rule-old",
          version: 1,
          createdByUserId: null,
          prompt: "prompt-v1",
          vars: ["input"],
          modelParams: { temperature: 0 },
          outputDefinition: { type: "numeric" },
          variableMapping: { input: "output" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "rule-other-project:quality-other-project",
          evaluatorId: "rule-other-project",
          version: 1,
          createdByUserId: null,
          prompt: "other-project",
          vars: [],
          modelParams: null,
          outputDefinition: null,
          variableMapping: { input: "input" },
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "unattached-v2:unattached-v1",
          evaluatorId: "unattached-v2",
          version: 1,
          createdByUserId: null,
          prompt: "unattached-v1",
          vars: [],
          modelParams: null,
          outputDefinition: null,
          variableMapping: null,
          sourceCode: null,
          sourceCodeLanguage: null,
        },
        {
          id: "unattached-v2:unattached-v2",
          evaluatorId: "unattached-v2",
          version: 2,
          createdByUserId: null,
          prompt: null,
          vars: [],
          modelParams: null,
          outputDefinition: null,
          variableMapping: null,
          sourceCode: "return false;",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      ]);
    });

    it("migrates exactly the expected assignments", async () => {
      const assignments =
        await prisma.evaluationRuleEvaluatorAssignment.findMany({
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            evaluationRuleId: true,
            evaluatorId: true,
            variableMapping: true,
          },
        });

      // One assignment per rule; only the same-score key-order pair shares an evaluator.
      expect(assignments).toEqual([
        {
          id: "legacy:rule-current",
          projectId: "project-a",
          evaluationRuleId: "rule-current",
          evaluatorId: "rule-current",
          variableMapping: null,
        },
        {
          id: "legacy:rule-key-order-a",
          projectId: "project-a",
          evaluationRuleId: "rule-key-order-a",
          evaluatorId: "rule-key-order-a",
          variableMapping: null,
        },
        {
          id: "legacy:rule-key-order-b",
          projectId: "project-a",
          evaluationRuleId: "rule-key-order-b",
          evaluatorId: "rule-key-order-a",
          variableMapping: null,
        },
        {
          id: "legacy:rule-managed",
          projectId: "project-a",
          evaluationRuleId: "rule-managed",
          evaluatorId: "rule-managed",
          variableMapping: null,
        },
        {
          id: "legacy:rule-managed-duplicate",
          projectId: "project-a",
          evaluationRuleId: "rule-managed-duplicate",
          evaluatorId: "rule-managed-duplicate",
          variableMapping: null,
        },
        {
          id: "legacy:rule-managed-other-project",
          projectId: "project-b",
          evaluationRuleId: "rule-managed-other-project",
          evaluatorId: "rule-managed-other-project",
          variableMapping: null,
        },
        {
          id: "legacy:rule-managed-second",
          projectId: "project-a",
          evaluationRuleId: "rule-managed-second",
          evaluatorId: "rule-managed-second",
          variableMapping: { output: "input" },
        },
        {
          id: "legacy:rule-old",
          projectId: "project-a",
          evaluationRuleId: "rule-old",
          evaluatorId: "rule-old",
          variableMapping: { input: "output" },
        },
        {
          id: "legacy:rule-other-project",
          projectId: "project-b",
          evaluationRuleId: "rule-other-project",
          evaluatorId: "rule-other-project",
          variableMapping: null,
        },
      ]);
    });
  });
}
