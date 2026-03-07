import { JobConfigState, JobExecutionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { clearAllEvalConfigsCaches } from "../evalJobConfigCache";
import { type JobConfigBlockReason } from "../../features/evals/configBlock";

type RawDbClient = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

type EvalConfigScope = {
  configIds?: string[];
  evalTemplateIds?: string[];
};

type BlockEvalConfigsBaseParams = {
  projectId: string;
  scope: EvalConfigScope;
  blockReason: JobConfigBlockReason;
  blockMessage: string;
  blockedAt?: Date;
};

type BlockEvalConfigsTxParams = BlockEvalConfigsBaseParams & {
  tx: Prisma.TransactionClient;
};

export type EvalConfigBlockState = {
  id: string;
  blockedAt: Date | null;
  blockReason: JobConfigBlockReason | null;
  blockMessage: string | null;
};

function buildEvalConfigScopeSql(scope: EvalConfigScope): Prisma.Sql | null {
  const clauses: Prisma.Sql[] = [];

  if (scope.configIds && scope.configIds.length > 0) {
    clauses.push(Prisma.sql`id IN (${Prisma.join(scope.configIds)})`);
  }

  if (scope.evalTemplateIds && scope.evalTemplateIds.length > 0) {
    clauses.push(
      Prisma.sql`eval_template_id IN (${Prisma.join(scope.evalTemplateIds)})`,
    );
  }

  if (clauses.length === 0) {
    return null;
  }

  return clauses.reduce((combined, clause, index) => {
    if (index === 0) {
      return clause;
    }

    return Prisma.sql`${combined} AND ${clause}`;
  });
}

export async function fetchEvalConfigBlockStates({
  db = prisma,
  projectId,
  configIds,
}: {
  db?: RawDbClient;
  projectId: string;
  configIds: string[];
}): Promise<EvalConfigBlockState[]> {
  if (configIds.length === 0) {
    return [];
  }

  return db.$queryRaw<EvalConfigBlockState[]>(Prisma.sql`
    SELECT
      id,
      blocked_at AS "blockedAt",
      block_reason::text AS "blockReason",
      block_message AS "blockMessage"
    FROM job_configurations
    WHERE project_id = ${projectId}
      AND id IN (${Prisma.join(configIds)})
  `);
}

export async function clearEvalConfigBlocksInTransaction({
  tx,
  projectId,
  configIds,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  configIds: string[];
}): Promise<void> {
  if (configIds.length === 0) {
    return;
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE job_configurations
    SET
      blocked_at = NULL,
      block_reason = NULL,
      block_message = NULL
    WHERE project_id = ${projectId}
      AND id IN (${Prisma.join(configIds)})
  `);
}

export async function clearEvalConfigBlocks({
  projectId,
  configIds,
}: {
  projectId: string;
  configIds: string[];
}): Promise<void> {
  await prisma.$transaction((tx) =>
    clearEvalConfigBlocksInTransaction({
      tx,
      projectId,
      configIds,
    }),
  );
}

export async function blockEvalConfigsInTransaction({
  tx,
  projectId,
  scope,
  blockReason,
  blockMessage,
  blockedAt = new Date(),
}: BlockEvalConfigsTxParams): Promise<{ blockedConfigIds: string[] }> {
  const scopeSql = buildEvalConfigScopeSql(scope);

  if (!scopeSql) {
    return { blockedConfigIds: [] };
  }

  const activeConfigs = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM job_configurations
    WHERE project_id = ${projectId}
      AND status::text = ${JobConfigState.ACTIVE}
      AND ${scopeSql}
  `);

  const blockedConfigIds = activeConfigs.map(({ id }) => id);

  if (blockedConfigIds.length === 0) {
    return { blockedConfigIds: [] };
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE job_configurations
    SET
      blocked_at = ${blockedAt},
      block_reason = ${blockReason}::"JobConfigBlockReason",
      block_message = ${blockMessage}
    WHERE project_id = ${projectId}
      AND status::text = ${JobConfigState.ACTIVE}
      AND id IN (${Prisma.join(blockedConfigIds)})
  `);

  await tx.$executeRaw(Prisma.sql`
    UPDATE job_executions
    SET
      status = ${JobExecutionStatus.CANCELLED}::"JobExecutionStatus",
      end_time = ${blockedAt}
    WHERE project_id = ${projectId}
      AND job_configuration_id IN (${Prisma.join(blockedConfigIds)})
      AND status::text IN (${Prisma.join([
        JobExecutionStatus.PENDING,
        JobExecutionStatus.DELAYED,
      ])})
  `);

  return { blockedConfigIds };
}

export async function blockEvalConfigs(
  params: BlockEvalConfigsBaseParams,
): Promise<{ blockedConfigIds: string[] }> {
  const result = await prisma.$transaction((tx) =>
    blockEvalConfigsInTransaction({
      tx,
      ...params,
    }),
  );

  if (result.blockedConfigIds.length > 0) {
    await clearAllEvalConfigsCaches(params.projectId);
  }

  return result;
}
