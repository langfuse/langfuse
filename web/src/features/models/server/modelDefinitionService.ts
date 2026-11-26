import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  ModelDefinitionSchema,
  ModelListItemSchema,
  type UpsertModelInput,
} from "@/src/features/models/validation";
import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  type ModelScope,
  ModelUsageUnit,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  clearModelCacheForOrganization,
  clearModelCacheForProject,
  escapeSqlLikePattern,
  findModel,
  findModelForOrganization,
  hasPricingTierUsageDetails,
  matchPricingTier,
  modelScopeRankSql,
  organizationModelsSql,
  visibleModelsSql,
} from "@langfuse/shared/src/server";

/**
 * Whose model definitions a call reads and writes. A project reads its own,
 * its organization's, and Langfuse's definitions and writes only its own; an
 * organization reads its own and Langfuse's and writes only its own.
 */
export type ModelDefinitionOwner =
  | { type: "project"; projectId: string }
  | { type: "organization"; organizationId: string };

const visibleSql = (owner: ModelDefinitionOwner, alias: string) =>
  owner.type === "project"
    ? visibleModelsSql(owner.projectId, alias)
    : organizationModelsSql(owner.organizationId, alias);

const ownedWhere = (owner: ModelDefinitionOwner) =>
  owner.type === "project"
    ? ({ scope: "PROJECT", projectId: owner.projectId } as const)
    : ({
        scope: "ORGANIZATION",
        organizationId: owner.organizationId,
      } as const);

const ownerLabel = (owner: ModelDefinitionOwner) =>
  owner.type === "project" ? "project" : "organization";

const modelColumnsSql = Prisma.sql`
  m.id,
  m.scope as "scope",
  m.project_id as "projectId",
  m.model_name as "modelName",
  m.match_pattern as "matchPattern",
  m.tokenizer_config as "tokenizerConfig",
  m.tokenizer_id as "tokenizerId",
  m.created_at as "createdAt",
  m.updated_at as "updatedAt",
  COALESCE(
    (
      SELECT
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', mpt.id,
            'name', mpt.name,
            'isDefault', mpt.is_default,
            'priority', mpt.priority,
            'conditions', mpt.conditions,
            'prices', COALESCE(
              (
                SELECT
                  JSONB_OBJECT_AGG(p.usage_type, p.price)
                FROM
                  prices p
                WHERE
                  p.pricing_tier_id = mpt.id
              ),
              '{}'::jsonb
            )
          )
          ORDER BY mpt.priority ASC
        )
      FROM
        pricing_tiers mpt
      WHERE
        mpt.model_id = m.id
    ),
    '[]'::json
  ) AS "pricingTiers"
`;

const snapshot = (tx: Prisma.TransactionClient, id: string) =>
  tx.model.findUnique({
    where: { id },
    include: {
      pricingTiers: {
        include: { prices: { select: { usageType: true, price: true } } },
        orderBy: { priority: "asc" },
      },
    },
  });

const clearCache = (owner: ModelDefinitionOwner) =>
  owner.type === "project"
    ? clearModelCacheForProject(owner.projectId)
    : clearModelCacheForOrganization(owner.organizationId);

export async function getModelDefinition(params: {
  owner: ModelDefinitionOwner;
  modelId: string;
}) {
  const rows = await prisma.$queryRaw`
    SELECT ${modelColumnsSql}
    FROM models m
    WHERE m.id = ${params.modelId}
      AND ${visibleSql(params.owner, "m")};
  `;
  const model = z.array(ModelDefinitionSchema).parse(rows)[0];
  if (!model) {
    throw new LangfuseNotFoundError("Model not found");
  }
  return model;
}

/**
 * One row per scope and model name. `isOverridden` marks rows whose name is
 * also defined in a higher-precedence scope. It is a naming convention only:
 * ingestion matches patterns, so a differently named definition can still win.
 */
export async function listModelDefinitions(params: {
  owner: ModelDefinitionOwner;
  searchString: string;
  /** Restricts the rows to these scopes; all visible scopes when omitted. */
  scopes?: ModelScope[];
  /** Starts at 1. */
  page: number;
  limit: number;
}) {
  const { owner, searchString, scopes, page, limit } = params;
  const searchCondition = searchString
    ? Prisma.sql`AND m.model_name ILIKE ${`%${escapeSqlLikePattern(searchString)}%`}`
    : Prisma.empty;
  const scopeCondition = scopes
    ? Prisma.sql`AND m.scope::text IN (${Prisma.join(scopes)})`
    : Prisma.empty;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT DISTINCT ON (${modelScopeRankSql("m")}, m.model_name)
        ${modelColumnsSql},
        EXISTS (
          SELECT 1
          FROM models o
          WHERE ${visibleSql(owner, "o")}
            AND o.model_name = m.model_name
            AND ${modelScopeRankSql("o")} < ${modelScopeRankSql("m")}
        ) AS "isOverridden"
      FROM models m
      WHERE ${visibleSql(owner, "m")}
        ${searchCondition}
        ${scopeCondition}
      ORDER BY
        ${modelScopeRankSql("m")},
        m.model_name,
        m.created_at DESC NULLS LAST,
        m.id
      LIMIT ${limit}
      OFFSET ${limit * (page - 1)}
    `,
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT (m.scope, m.model_name))
      FROM models m
      WHERE ${visibleSql(owner, "m")}
        ${searchCondition}
        ${scopeCondition};
    `,
  ]);

  return {
    models: z.array(ModelListItemSchema).parse(rows),
    totalCount: z.coerce.number().parse(countRows[0].count),
  };
}

type ModelDefinitionWrite = Pick<
  UpsertModelInput,
  "modelName" | "matchPattern" | "pricingTiers"
> &
  Partial<Pick<UpsertModelInput, "tokenizerConfig" | "tokenizerId">>;

/** Creates or replaces `modelId` with `input` and writes the audit log. */
async function writeModelDefinition(
  tx: Prisma.TransactionClient,
  params: {
    owner: ModelDefinitionOwner;
    actor: AuditLogActor;
    modelId: string;
    input: ModelDefinitionWrite;
  },
) {
  const { owner, actor, modelId, input } = params;
  const { modelName, matchPattern, tokenizerConfig, tokenizerId } = input;
  const owned = ownedWhere(owner);

  const before = await snapshot(tx, modelId);
  // An id owned by anyone else, including Langfuse, reads as missing.
  if (
    before &&
    (before.scope !== owned.scope ||
      (owner.type === "project"
        ? before.projectId !== owner.projectId
        : before.organizationId !== owner.organizationId))
  ) {
    throw new LangfuseNotFoundError("Model not found");
  }

  const upserted = await tx.model.upsert({
    where: { id: modelId, ...owned },
    create: {
      id: modelId,
      ...owned,
      modelName,
      matchPattern,
      tokenizerConfig,
      tokenizerId,
      // Fixed values keep the project unique constraint effective.
      startDate: new Date("2010-01-01"),
      unit: ModelUsageUnit.Tokens,
    },
    update: { matchPattern, tokenizerConfig, tokenizerId },
  });

  await tx.pricingTier.deleteMany({ where: { modelId: upserted.id } });
  for (const tier of input.pricingTiers) {
    const createdTier = await tx.pricingTier.create({
      data: {
        modelId: upserted.id,
        name: tier.name,
        isDefault: tier.isDefault,
        priority: tier.priority,
        conditions: tier.conditions,
      },
    });
    await tx.price.createMany({
      data: Object.entries(tier.prices).map(([usageType, price]) => ({
        modelId: upserted.id,
        projectId: upserted.projectId,
        pricingTierId: createdTier.id,
        usageType,
        price,
      })),
    });
  }

  await auditLog(
    {
      ...actor,
      resourceType: "model",
      resourceId: upserted.id,
      action: before ? "update" : "create",
      before: before ?? undefined,
      after: await snapshot(tx, upserted.id),
    },
    tx,
  );

  return { model: upserted, created: !before };
}

// Postgres validates the pattern, because ingestion matches it with POSIX
// regex semantics that JavaScript does not share.
async function assertValidMatchPattern(matchPattern: string) {
  if (!(await isValidPostgresRegex(matchPattern, prisma))) {
    throw new InvalidRequestError("Invalid regex, needs to be Postgres syntax");
  }
}

export async function upsertModelDefinition(params: {
  owner: ModelDefinitionOwner;
  actor: AuditLogActor;
  input: UpsertModelInput;
}) {
  const { owner, actor, input } = params;
  await assertValidMatchPattern(input.matchPattern);

  const modelId = input.modelId ?? uuidv4();
  const owned = ownedWhere(owner);

  const result = await prisma.$transaction(async (tx) => {
    // Name uniqueness within the owner is checked explicitly: the project
    // unique constraint includes the nullable start_date and unit columns.
    const sameName = await tx.model.findFirst({
      where: { ...owned, modelName: input.modelName },
    });
    if (sameName && sameName.id !== modelId) {
      throw new InvalidRequestError(
        `Model name '${input.modelName}' already exists in ${ownerLabel(owner)}`,
      );
    }
    return writeModelDefinition(tx, { owner, actor, modelId, input });
  });

  await clearCache(owner);
  return result.model;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * Creates the organization's model named `input.modelName`, or fully replaces
 * it. `created` tells which happened. The name is the identity, so concurrent
 * first writes of one name collide on the organization's unique name index;
 * the loser retries once, then replaces the winner's row.
 */
export async function putOrganizationModelDefinitionByName(params: {
  organizationId: string;
  actor: AuditLogActor;
  input: ModelDefinitionWrite;
}) {
  const { organizationId, actor, input } = params;
  const owner: ModelDefinitionOwner = { type: "organization", organizationId };
  await assertValidMatchPattern(input.matchPattern);

  const write = () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.model.findFirst({
        where: { ...ownedWhere(owner), modelName: input.modelName },
        select: { id: true },
      });
      return writeModelDefinition(tx, {
        owner,
        actor,
        modelId: existing?.id ?? uuidv4(),
        input,
      });
    });

  let result: Awaited<ReturnType<typeof write>>;
  try {
    result = await write();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    try {
      result = await write();
    } catch (retryError) {
      if (!isUniqueViolation(retryError)) throw retryError;
      throw new LangfuseConflictError(
        `Model '${input.modelName}' was written concurrently, retry the request`,
      );
    }
  }

  await clearCache(owner);
  return result;
}

export async function deleteModelDefinition(params: {
  owner: ModelDefinitionOwner;
  actor: AuditLogActor;
  modelId: string;
}) {
  const { owner, actor, modelId } = params;

  const deleted = await prisma.$transaction(async (tx) => {
    const owned = await tx.model.findFirst({
      where: { id: modelId, ...ownedWhere(owner) },
      select: { id: true },
    });
    if (!owned) throw new LangfuseNotFoundError("Model not found");

    const before = await snapshot(tx, modelId);
    const model = await tx.model.delete({ where: { id: modelId } });
    await auditLog(
      {
        ...actor,
        resourceType: "model",
        resourceId: modelId,
        action: "delete",
        before,
      },
      tx,
    );
    return model;
  });

  await clearCache(owner);
  return deleted;
}

export async function testModelDefinitionMatch(params: {
  owner: ModelDefinitionOwner;
  modelName: string;
  usageDetails?: Record<string, number>;
  modelParameters?: Record<string, string>;
  metadata?: Record<string, string>;
}) {
  const { owner, modelName, usageDetails, modelParameters, metadata } = params;

  const { model, pricingTiers } =
    owner.type === "project"
      ? await findModel({ projectId: owner.projectId, model: modelName })
      : await findModelForOrganization({
          organizationId: owner.organizationId,
          model: modelName,
        });

  if (!model) return { matched: false as const };

  // Without usage details, fall back to the model's default pricing tier.
  const matchedTierId = hasPricingTierUsageDetails(usageDetails)
    ? matchPricingTier(pricingTiers, usageDetails ?? {}, {
        modelParameters,
        metadata,
      })?.pricingTierId
    : pricingTiers.find((tier) => tier.isDefault)?.id;
  const matchedTier = pricingTiers.find((tier) => tier.id === matchedTierId);
  if (!matchedTier) return { matched: false as const };

  return {
    matched: true as const,
    model: {
      id: model.id,
      modelName: model.modelName,
      matchPattern: model.matchPattern,
      scope: model.scope,
      projectId: model.projectId,
    },
    matchedTier: {
      id: matchedTier.id,
      name: matchedTier.name,
      priority: matchedTier.priority,
      isDefault: matchedTier.isDefault,
      prices: Object.fromEntries(
        matchedTier.prices.map((p) => [p.usageType, p.price.toNumber()]),
      ),
    },
  };
}
