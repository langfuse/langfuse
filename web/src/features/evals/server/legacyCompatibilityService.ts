import {
  CODE_EVAL_TEMPLATE_VARIABLES,
  EvalTargetObject,
  EvalTemplateType,
  ForbiddenError,
  InvalidRequestError,
  getCodeEvalVariableMapping,
  JobConfigState,
  JobType,
  LangfuseConflictError,
  LangfuseNotFoundError,
  Prisma,
  type FilterState,
  type JobTimeScope,
  type OrderByState,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";
import type {
  Evaluator,
  EvaluatorVersion,
  PrismaClient,
} from "@langfuse/shared/src/db";
import {
  orderByToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared/src/server";
import { isEqual } from "lodash";
import { isNotNullOrUndefined } from "@/src/utils/types";
import {
  evalConfigFilterColumns,
  evalConfigsTableCols,
} from "@/src/server/api/definitions/evalConfigsTable";
import { resetEvalConfigBlockFields } from "@/src/features/evals/server/evalConfigState";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import {
  getEvalTemplateVariables,
  prepareConfigsForTemplateUpgrade,
  prepareVariableMappingForEvaluatorUpgrade,
} from "@/src/features/evals/server/evaluatorUpgrade";
import { getSupportedCodeEvalTemplateLanguages } from "@/src/features/evals/server/isCodeEvalEnabled";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import type { ManagedTemplate } from "@/src/features/evals/v2/types/templateGallery";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import {
  getLegacyEvaluatorPrompt,
  reconcileEvaluatorPromptMessages,
  toEvaluatorDefinition,
} from "@/src/features/evals/v2/server/evaluators/evaluatorService";

const MANAGED_TEMPLATE_ID_PREFIX = "managed:";

/**
 * Every target the legacy editor can own. `EVENT` belongs here: it is the
 * default target of the legacy form, so leaving it out silently turned edits
 * and deletes of observation-level evaluators into no-ops.
 */
const LEGACY_TARGET_OBJECTS = [
  EvalTargetObject.TRACE,
  EvalTargetObject.DATASET,
  EvalTargetObject.EVENT,
  EvalTargetObject.EXPERIMENT,
];

const latestVersion = {
  orderBy: { version: "desc" as const },
  take: 1,
};

const ruleInclude = {
  assignments: {
    orderBy: { createdAt: "asc" as const },
    include: {
      evaluator: {
        include: { versions: latestVersion },
      },
    },
  },
} satisfies Prisma.EvaluationRuleInclude;

type StoredRule = Prisma.EvaluationRuleGetPayload<{
  include: typeof ruleInclude;
}>;

type StableEvaluator = Evaluator & { versions: EvaluatorVersion[] };

type TransactionClient = Prisma.TransactionClient;

export type LegacyConfig = ReturnType<typeof toLegacyConfig>;

function managedTemplateId(key: string) {
  return `${MANAGED_TEMPLATE_ID_PREFIX}${key}`;
}

function toLegacyManagedTemplate(template: ManagedTemplate) {
  const now = new Date(0);
  if (template.evaluator.type === EvalTemplateType.CODE) {
    return {
      id: managedTemplateId(template.key),
      createdAt: now,
      updatedAt: now,
      projectId: null,
      name: template.name,
      version: 1,
      prompt: null,
      type: EvalTemplateType.CODE,
      partner: null,
      model: null,
      provider: null,
      modelParams: null,
      vars: [...CODE_EVAL_TEMPLATE_VARIABLES],
      outputDefinition: null,
      sourceCode: template.evaluator.source,
      sourceCodeLanguage: template.evaluator.language,
    };
  }

  return {
    id: managedTemplateId(template.key),
    createdAt: now,
    updatedAt: now,
    projectId: null,
    name: template.name,
    version: 1,
    prompt: getLegacyEvaluatorPrompt(template.evaluator.promptMessages),
    type: EvalTemplateType.LLM_AS_JUDGE,
    partner: null,
    model: null,
    provider: null,
    modelParams: null,
    vars: template.evaluator.variables.map(({ name }) => name),
    outputDefinition: template.evaluator.outputDefinition,
    sourceCode: null,
    sourceCodeLanguage: null,
  };
}

function toLegacyEvaluatorTemplate(evaluator: StableEvaluator) {
  const version = evaluator.versions[0];
  if (!version) return null;

  return {
    id: version.id,
    createdAt: evaluator.createdAt,
    updatedAt: evaluator.updatedAt,
    projectId: evaluator.projectId,
    name: evaluator.name,
    version: version.version,
    prompt:
      evaluator.type === EvalTemplateType.LLM_AS_JUDGE
        ? getLegacyEvaluatorPrompt(
            reconcileEvaluatorPromptMessages({
              prompt: version.prompt,
              promptMessages: version.promptMessages,
            }),
          )
        : null,
    type: evaluator.type,
    partner: version.partner,
    model: version.model,
    provider: version.provider,
    modelParams: version.modelParams,
    vars: version.vars,
    outputDefinition: version.outputDefinition,
    sourceCode: version.sourceCode,
    sourceCodeLanguage:
      version.sourceCodeLanguage as EvalTemplateSourceCodeLanguage | null,
  };
}

function toLegacyConfig(rule: StoredRule) {
  const assignment = rule.assignments[0];
  const evaluator = assignment?.evaluator;
  const template = evaluator ? toLegacyEvaluatorTemplate(evaluator) : null;

  return {
    id: rule.id,
    projectId: rule.projectId,
    evalTemplateId: evaluator?.versions[0]?.id ?? "",
    scoreName: evaluator?.name ?? rule.name,
    targetObject: rule.targetObject,
    filter: rule.filter,
    variableMapping:
      assignment?.variableMapping ??
      evaluator?.versions[0]?.variableMapping ??
      [],
    sampling: rule.sampling,
    delay: rule.delay,
    status: rule.status,
    blockedAt: evaluator?.blockedAt ?? null,
    blockReason: evaluator?.blockReason ?? null,
    blockMessage: evaluator?.blockMessage ?? null,
    jobType: JobType.EVAL,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    timeScope: rule.timeScope as JobTimeScope[],
    evalTemplate: template,
  };
}

type LlmEvaluatorVariableMapping = Extract<
  EvaluatorDefinition,
  { type: typeof EvalTemplateType.LLM_AS_JUDGE }
>["variableMapping"];

function definitionFromManagedTemplate(
  template: ManagedTemplate,
  variableMapping: LlmEvaluatorVariableMapping,
): EvaluatorDefinition {
  if (template.evaluator.type === EvalTemplateType.CODE) {
    return {
      type: EvalTemplateType.CODE,
      sourceCode: template.evaluator.source,
      sourceCodeLanguage: template.evaluator.language,
    };
  }

  return {
    type: EvalTemplateType.LLM_AS_JUDGE,
    promptMessages: template.evaluator.promptMessages,
    provider: null,
    model: null,
    modelParams: null,
    vars: template.evaluator.variables.map(({ name }) => name),
    variableMapping,
    outputDefinition: template.evaluator.outputDefinition,
  };
}

function definitionFromEvaluator(
  evaluator: StableEvaluator,
  variableMapping: LlmEvaluatorVariableMapping,
): EvaluatorDefinition | null {
  const version = evaluator.versions[0];
  if (!version) return null;
  if (evaluator.type === EvalTemplateType.CODE) {
    if (!version.sourceCode || !version.sourceCodeLanguage) return null;
    return {
      type: EvalTemplateType.CODE,
      sourceCode: version.sourceCode,
      sourceCodeLanguage: version.sourceCodeLanguage,
    };
  }
  if (!version.outputDefinition) return null;
  const definition = toEvaluatorDefinition(evaluator.type, version);
  return definition.type === EvalTemplateType.LLM_AS_JUDGE
    ? { ...definition, variableMapping }
    : null;
}

function evaluatorVersionData(
  definition: EvaluatorDefinition,
  createdByUserId: string | null,
) {
  const common = {
    createdByUserId,
  };
  return definition.type === EvalTemplateType.CODE
    ? {
        ...common,
        variableMapping: getCodeEvalVariableMapping() as Prisma.InputJsonValue,
        sourceCode: definition.sourceCode,
        sourceCodeLanguage: definition.sourceCodeLanguage,
      }
    : {
        ...common,
        variableMapping:
          definition.variableMapping === null
            ? Prisma.DbNull
            : (definition.variableMapping as Prisma.InputJsonValue),
        prompt: getLegacyEvaluatorPrompt(definition.promptMessages),
        promptMessages: definition.promptMessages as Prisma.InputJsonValue,
        provider: definition.provider,
        model: definition.model,
        modelParams:
          definition.modelParams === null
            ? Prisma.DbNull
            : (definition.modelParams as Prisma.InputJsonValue),
        vars: definition.vars,
        outputDefinition: definition.outputDefinition as Prisma.InputJsonValue,
      };
}

/**
 * Compares what makes two evaluators the same *definition*. The variable
 * mapping is deliberately excluded: it belongs to the rule assignment, so two
 * rules can share one evaluator and still map their variables differently.
 */
function definitionsMatch(a: EvaluatorDefinition, b: EvaluatorDefinition) {
  if (a.type === EvalTemplateType.CODE && b.type === EvalTemplateType.CODE) {
    return (
      a.sourceCode === b.sourceCode &&
      a.sourceCodeLanguage === b.sourceCodeLanguage
    );
  }
  if (
    a.type === EvalTemplateType.LLM_AS_JUDGE &&
    b.type === EvalTemplateType.LLM_AS_JUDGE
  ) {
    return (
      isEqual(a.promptMessages, b.promptMessages) &&
      a.provider === b.provider &&
      a.model === b.model &&
      isEqual(a.modelParams, b.modelParams) &&
      isEqual([...a.vars].sort(), [...b.vars].sort()) &&
      isEqual(a.outputDefinition, b.outputDefinition)
    );
  }
  return false;
}

/**
 * The legacy editor picks a template *and* a score name, but in the current
 * model the evaluator name is the score name the worker writes. Attaching the
 * new rule to the evaluator that already owns the picked definition keeps the
 * legacy flow from minting a near-duplicate library entry per rule; a score
 * name that diverges from the evaluator name still has to fork.
 *
 * A blocked evaluator is reused like any other: the definition is identical,
 * so a copy would be blocked again on its first execution anyway.
 */
async function findReusableEvaluatorId(params: {
  tx: TransactionClient;
  projectId: string;
  templateId: string;
  scoreName: string;
  definition: EvaluatorDefinition;
}): Promise<string | null> {
  const { tx, projectId, templateId, scoreName, definition } = params;

  if (templateId.startsWith(MANAGED_TEMPLATE_ID_PREFIX)) {
    // Managed catalog entries have no row of their own to attach to, so look
    // for the project copy an earlier legacy create already made from them.
    const candidates = await tx.evaluator.findMany({
      where: { projectId, name: scoreName, type: definition.type },
      include: { versions: latestVersion },
    });
    const match = candidates.find((candidate) => {
      const candidateDefinition = definitionFromEvaluator(candidate, null);
      return (
        candidateDefinition !== null &&
        definitionsMatch(candidateDefinition, definition)
      );
    });
    return match?.id ?? null;
  }

  const version = await tx.evaluatorVersion.findFirst({
    where: { id: templateId, evaluator: { projectId } },
    include: { evaluator: { include: { versions: latestVersion } } },
  });
  if (!version) return null;

  const { evaluator } = version;
  if (evaluator.name !== scoreName || evaluator.type !== definition.type) {
    return null;
  }
  return evaluator.id;
}

/**
 * Mirrors the capability filter the legacy `eval_templates` queries applied: a
 * code evaluator no configured dispatcher can run must not be offered by the
 * legacy editor, otherwise it can be saved into a rule that never executes.
 */
function isRunnableTemplate(template: {
  type: EvalTemplateType;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
}) {
  if (template.type !== EvalTemplateType.CODE) return true;

  return (
    template.sourceCodeLanguage !== null &&
    getSupportedCodeEvalTemplateLanguages().includes(
      template.sourceCodeLanguage,
    )
  );
}

type ManagedCatalogEntry = {
  template: ReturnType<typeof toLegacyManagedTemplate>;
  definition: EvaluatorDefinition;
};

function runnableManagedCatalog(): ManagedCatalogEntry[] {
  return MANAGED_TEMPLATES_CATALOG.templates
    .map((template) => ({
      template: toLegacyManagedTemplate(template),
      definition: definitionFromManagedTemplate(template, null),
    }))
    .filter(({ template }) => isRunnableTemplate(template));
}

/**
 * The catalog entry a project evaluator is still a verbatim copy of. Creating a
 * legacy configuration from a managed template has to materialize a project
 * evaluator (the score name lives on it), so the legacy lists would otherwise
 * show the same evaluator twice — once as "Langfuse maintained", once as the
 * copy. Editing the copy changes its definition and it stops matching, which is
 * exactly when it deserves its own row again.
 */
function findManagedOriginal(
  evaluator: StableEvaluator,
  catalog: ManagedCatalogEntry[],
) {
  const definition = definitionFromEvaluator(evaluator, null);
  if (!definition) return null;

  return (
    catalog.find(
      (entry) =>
        entry.template.name === evaluator.name &&
        definitionsMatch(entry.definition, definition),
    ) ?? null
  );
}

const MAX_REFERENCING_EVALUATORS_IN_ERROR = 5;

function buildTemplateInUseMessage(ruleNames: string[]) {
  // count unique names, not raw rules: several rules can share a score name
  // and the count must match the listed names
  const names = [...new Set(ruleNames)];
  const shown = names
    .slice(0, MAX_REFERENCING_EVALUATORS_IN_ERROR)
    .map((name) => `"${name}"`)
    .join(", ");
  const overflow =
    names.length > MAX_REFERENCING_EVALUATORS_IN_ERROR
      ? ` and ${names.length - MAX_REFERENCING_EVALUATORS_IN_ERROR} more`
      : "";

  return `This evaluator is in use by ${names.length} running evaluator(s): ${shown}${overflow}. Delete those running evaluators first.`;
}

const copyJson = (value: Prisma.JsonValue | null) =>
  value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

/**
 * Reactivating a legacy configuration has to unblock its evaluator, the way
 * activating a job configuration used to reset the block columns it owned.
 * Reads the assignment again because a rename may have forked the evaluator.
 */
async function clearEvaluatorBlock(params: {
  tx: TransactionClient;
  projectId: string;
  assignmentId: string;
}) {
  const assignment =
    await params.tx.evaluationRuleEvaluatorAssignment.findFirst({
      where: { id: params.assignmentId, projectId: params.projectId },
      select: { evaluatorId: true },
    });
  if (!assignment) return;

  await params.tx.evaluator.updateMany({
    where: { id: assignment.evaluatorId, projectId: params.projectId },
    data: resetEvalConfigBlockFields,
  });
}

/**
 * The evaluator name is the score name, so a legacy rename must not travel to
 * the other rules sharing that evaluator. Rename in place while this rule is
 * the only user, and fork a private copy otherwise.
 */
async function applyScoreNameChange(params: {
  tx: TransactionClient;
  projectId: string;
  assignmentId: string;
  evaluatorId: string;
  scoreName: string;
}) {
  const { tx, projectId, assignmentId, evaluatorId, scoreName } = params;
  const evaluator = await tx.evaluator.findFirst({
    where: { id: evaluatorId, projectId },
    include: {
      versions: latestVersion,
      _count: { select: { assignments: true } },
    },
  });
  if (!evaluator || evaluator.name === scoreName) return;

  if (evaluator._count.assignments <= 1) {
    await tx.evaluator.update({
      where: { id: evaluatorId, projectId },
      data: { name: scoreName },
    });
    return;
  }

  const version = evaluator.versions[0];
  const fork = await tx.evaluator.create({
    data: {
      projectId,
      name: scoreName,
      description: evaluator.description,
      type: evaluator.type,
      createdByUserId: evaluator.createdByUserId,
      // The definition is unchanged, so whatever blocked the original blocks
      // the copy too. Starting unblocked would only defer the failure.
      blockedAt: evaluator.blockedAt,
      blockReason: evaluator.blockReason,
      blockMessage: evaluator.blockMessage,
      versions: version
        ? {
            create: {
              version: 1,
              createdByUserId: version.createdByUserId,
              prompt: version.prompt,
              partner: version.partner,
              model: version.model,
              provider: version.provider,
              modelParams: copyJson(version.modelParams),
              vars: version.vars,
              variableMapping: copyJson(version.variableMapping),
              outputDefinition: copyJson(version.outputDefinition),
              sourceCode: version.sourceCode,
              sourceCodeLanguage: version.sourceCodeLanguage,
            },
          }
        : undefined,
    },
  });
  await tx.evaluationRuleEvaluatorAssignment.update({
    where: { id: assignmentId, projectId },
    data: { evaluatorId: fork.id },
  });
}

/**
 * The legacy evaluator table filters, sorts and paginates over a shape the
 * current schema spreads across three tables. It can project any rule with
 * exactly one evaluator assignment, but must exclude unmapped and
 * multi-evaluator rules. Selecting the ids in SQL keeps the filter and order
 * definitions in `evalConfigsTable` reusable (they address the derived table as
 * `jc`, exactly like the job-configuration query they were written for) and
 * keeps the total count in sync with the rows that are actually returned.
 */
const legacyConfigIdsQuery = (params: {
  select: Prisma.Sql;
  projectId: string;
  targetCondition: Prisma.Sql;
  filterCondition: Prisma.Sql;
  searchCondition: Prisma.Sql;
  orderCondition: Prisma.Sql;
  paginationCondition: Prisma.Sql;
}) => Prisma.sql`
  SELECT ${params.select}
  FROM (
    SELECT
      r."id",
      r."status",
      r."target_object",
      r."time_scope",
      r."created_at",
      r."updated_at",
      r."name" AS "rule_name",
      e."name" AS "score_name",
      e."blocked_at"
    FROM "evaluation_rules" r
    JOIN (
      SELECT "evaluation_rule_id", min("evaluator_id") AS "evaluator_id"
      FROM "evaluation_rule_evaluator_assignments"
      WHERE "project_id" = ${params.projectId}
      GROUP BY "evaluation_rule_id"
      HAVING count(*) = 1
    ) a ON a."evaluation_rule_id" = r."id"
    JOIN "evaluators" e ON e."id" = a."evaluator_id"
    WHERE r."project_id" = ${params.projectId}
  ) jc
  WHERE TRUE
  ${params.targetCondition}
  ${params.filterCondition}
  ${params.searchCondition}
  ${params.orderCondition}
  ${params.paginationCondition}
`;

const legacyConfigsOrderBy = (orderBy: OrderByState) => {
  const resolvedOrderBy = orderBy ?? {
    column: "createdAt",
    order: "DESC" as const,
  };
  const orderByCondition = orderByToPrismaSql(
    resolvedOrderBy,
    evalConfigsTableCols,
  );
  const idTieBreak =
    resolvedOrderBy.order === "DESC"
      ? Prisma.sql`jc."id" DESC`
      : Prisma.sql`jc."id" ASC`;
  // Status sorts into three buckets, so break ties by recency like the legacy
  // table did. The id keeps pagination stable for equal sort keys.
  return resolvedOrderBy.column === "status" ||
    resolvedOrderBy.column === "Status"
    ? Prisma.sql`${orderByCondition}, jc."created_at" DESC, ${idTieBreak}`
    : Prisma.sql`${orderByCondition}, ${idTieBreak}`;
};

export class LegacyEvalCompatibilityService {
  constructor(private readonly prisma: PrismaClient) {}

  async counts(projectId: string) {
    const [configCount, configActiveCount, templateCount, legacyConfigCount] =
      await Promise.all([
        this.prisma.evaluationRule.count({ where: { projectId } }),
        this.prisma.evaluationRule.count({
          where: { projectId, status: JobConfigState.ACTIVE },
        }),
        this.prisma.evaluator.count({ where: { projectId } }),
        this.prisma.evaluationRule.count({
          where: {
            projectId,
            targetObject: {
              in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
            },
          },
        }),
      ]);
    return { configCount, configActiveCount, templateCount, legacyConfigCount };
  }

  /**
   * Omitting `page`/`limit` returns every match. Callers that need the whole
   * set (the dataset toggle, the experiment selector) must not silently cap
   * themselves at an arbitrary page size.
   */
  async listConfigs(params: {
    projectId: string;
    page?: number;
    limit?: number;
    filter?: FilterState;
    orderBy?: OrderByState;
    searchQuery?: string | null;
    targetObjects?: string[];
  }) {
    if (params.targetObjects && params.targetObjects.length === 0) {
      return { configs: [], totalCount: 0 };
    }

    // An empty arrayOptions filter is a no-op, and passing it through would
    // build `time_scope @> ARRAY[]` and match nothing.
    const sanitizedFilter = (params.filter ?? []).filter(
      (f) =>
        !(
          f.type === "arrayOptions" &&
          f.value.length === 0 &&
          f.operator !== "any of"
        ),
    );
    const filterCondition = tableColumnsToSqlFilterAndPrefix(
      sanitizedFilter,
      evalConfigFilterColumns,
      "evaluation_rules",
    );
    const targetCondition = params.targetObjects
      ? Prisma.sql`AND jc."target_object" IN (${Prisma.join(
          params.targetObjects.map((target) => Prisma.sql`${target}`),
        )})`
      : Prisma.empty;
    const search = params.searchQuery?.trim();
    const searchCondition = search
      ? Prisma.sql`AND (jc."score_name" ILIKE ${`%${search}%`} OR jc."rule_name" ILIKE ${`%${search}%`})`
      : Prisma.empty;
    const paginationCondition =
      params.limit !== undefined
        ? Prisma.sql`LIMIT ${params.limit} OFFSET ${(params.page ?? 0) * params.limit}`
        : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(
        legacyConfigIdsQuery({
          select: Prisma.sql`jc."id"`,
          projectId: params.projectId,
          targetCondition,
          filterCondition,
          searchCondition,
          orderCondition: legacyConfigsOrderBy(params.orderBy ?? null),
          paginationCondition,
        }),
      ),
      this.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
        legacyConfigIdsQuery({
          select: Prisma.sql`count(*) AS "totalCount"`,
          projectId: params.projectId,
          targetCondition,
          filterCondition,
          searchCondition,
          orderCondition: Prisma.empty,
          paginationCondition: Prisma.empty,
        }),
      ),
    ]);

    const ids = rows.map(({ id }) => id);
    const rules = ids.length
      ? await this.prisma.evaluationRule.findMany({
          where: { id: { in: ids }, projectId: params.projectId },
          include: ruleInclude,
        })
      : [];
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));

    return {
      // the query already ordered the ids; findMany does not preserve that
      configs: ids
        .map((id) => rulesById.get(id))
        .filter(isNotNullOrUndefined)
        .map(toLegacyConfig),
      totalCount: counts.length > 0 ? Number(counts[0]?.totalCount) : 0,
    };
  }

  async getConfig(projectId: string, ruleId: string) {
    const rule = await this.prisma.evaluationRule.findFirst({
      where: { id: ruleId, projectId },
      include: ruleInclude,
    });
    if (!rule || rule.assignments.length > 1) return null;
    if (
      rule.assignments.length === 0 &&
      !isLegacyEvalTarget(rule.targetObject)
    ) {
      return null;
    }
    return toLegacyConfig(rule);
  }

  /**
   * Legacy executions use the rule ID, while evaluator-addressed V2 runs use
   * the assigned evaluator ID. Read both so migration does not hide history.
   */
  async resolveExecutionConfigIds(
    projectId: string,
    jobConfigurationIds: string[],
  ) {
    const executionIdsByJobConfigurationId = new Map(
      jobConfigurationIds.map((id) => [id, new Set([id])]),
    );
    const assignments =
      await this.prisma.evaluationRuleEvaluatorAssignment.findMany({
        where: {
          projectId,
          evaluationRuleId: { in: jobConfigurationIds },
        },
        select: { evaluationRuleId: true, evaluatorId: true },
      });

    for (const assignment of assignments) {
      executionIdsByJobConfigurationId
        .get(assignment.evaluationRuleId)
        ?.add(assignment.evaluatorId);
    }

    return Object.fromEntries(
      [...executionIdsByJobConfigurationId].map(
        ([jobConfigurationId, executionIds]) => [
          jobConfigurationId,
          [...executionIds],
        ],
      ),
    );
  }

  async listProjectTemplates(
    projectId: string,
    options: { collapseManagedCopies?: boolean } = {},
  ) {
    const evaluators = await this.prisma.evaluator.findMany({
      where: { projectId },
      include: { versions: latestVersion },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
    const catalog = options.collapseManagedCopies
      ? runnableManagedCatalog()
      : [];
    return evaluators.flatMap((evaluator) => {
      if (catalog.length && findManagedOriginal(evaluator, catalog)) return [];
      const template = toLegacyEvaluatorTemplate(evaluator);
      return template && isRunnableTemplate(template) ? [template] : [];
    });
  }

  async listTemplateFamilies(params: {
    projectId: string;
    page: number;
    limit: number;
    searchQuery?: string | null;
  }) {
    const search = params.searchQuery?.trim();
    const evaluators = await this.prisma.evaluator.findMany({
      where: {
        projectId: params.projectId,
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      include: {
        versions: latestVersion,
        _count: { select: { assignments: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const catalog = runnableManagedCatalog();
    // usage of a collapsed copy belongs to the catalog entry it came from,
    // otherwise the row that stays visible claims nothing uses it
    const usageByManagedId = new Map<string, number>();
    const projectTemplates = evaluators.flatMap((evaluator) => {
      const managedOriginal = findManagedOriginal(evaluator, catalog);
      if (managedOriginal) {
        const id = managedOriginal.template.id;
        usageByManagedId.set(
          id,
          (usageByManagedId.get(id) ?? 0) + evaluator._count.assignments,
        );
        return [];
      }
      const template = toLegacyEvaluatorTemplate(evaluator);
      return template && isRunnableTemplate(template)
        ? [
            {
              latestId: template.id,
              name: template.name,
              projectId: template.projectId,
              version: template.version,
              // "Last Edited" is when the newest version was written, not when
              // the evaluator was first created.
              latestCreatedAt: evaluator.versions[0]?.createdAt,
              usageCount: evaluator._count.assignments,
              partner: template.partner ?? undefined,
              provider: template.provider ?? undefined,
              model: template.model ?? undefined,
              type: template.type,
              sourceCodeLanguage: template.sourceCodeLanguage,
              outputDefinition: template.outputDefinition,
            },
          ]
        : [];
    });
    const managedTemplates = this.listManagedTemplates()
      .filter(
        (template) =>
          !search || template.name.toLowerCase().includes(search.toLowerCase()),
      )
      .map((template) => ({
        latestId: template.id,
        name: template.name,
        projectId: template.projectId,
        version: template.version,
        // The catalog ships with the app and has no edit date; a placeholder
        // would render as an actual (1970) date in the table.
        latestCreatedAt: undefined,
        usageCount: usageByManagedId.get(template.id) ?? 0,
        partner: template.partner ?? undefined,
        provider: template.provider ?? undefined,
        model: template.model ?? undefined,
        type: template.type,
        sourceCodeLanguage: template.sourceCodeLanguage,
        outputDefinition: template.outputDefinition,
      }));
    // one list ordered by name, the way the legacy query returned managed and
    // project templates interleaved rather than grouped by provenance
    const templates = [...managedTemplates, ...projectTemplates].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const start = params.page * params.limit;
    return {
      templates: templates.slice(start, start + params.limit),
      totalCount: templates.length,
    };
  }

  listManagedTemplates() {
    return MANAGED_TEMPLATES_CATALOG.templates
      .map(toLegacyManagedTemplate)
      .filter(isRunnableTemplate);
  }

  /**
   * `collapseManagedCopies` is for pickers, where an untouched copy is noise:
   * picking the catalog entry resolves back to that very evaluator anyway.
   * Leave it off where the full set matters, such as the name-conflict check
   * in the template form.
   */
  async listTemplates(
    projectId: string,
    options: { collapseManagedCopies?: boolean } = {},
  ) {
    return [
      ...(await this.listProjectTemplates(projectId, options)),
      ...this.listManagedTemplates(),
    ];
  }

  async getTemplate(projectId: string, templateId: string) {
    if (templateId.startsWith(MANAGED_TEMPLATE_ID_PREFIX)) {
      const key = templateId.slice(MANAGED_TEMPLATE_ID_PREFIX.length);
      const template = MANAGED_TEMPLATES_CATALOG.templates.find(
        (candidate) => candidate.key === key,
      );
      if (!template) return null;
      const legacyTemplate = toLegacyManagedTemplate(template);
      return isRunnableTemplate(legacyTemplate) ? legacyTemplate : null;
    }
    const version = await this.prisma.evaluatorVersion.findFirst({
      where: { id: templateId, evaluator: { projectId } },
      include: { evaluator: true },
    });
    if (!version) return null;
    const template = toLegacyEvaluatorTemplate({
      ...version.evaluator,
      versions: [version],
    });
    return template && isRunnableTemplate(template) ? template : null;
  }

  async getDefinition(params: {
    projectId: string;
    templateId: string;
    targetObject: EvalTargetObject;
    variableMapping: unknown;
  }) {
    if (params.templateId.startsWith(MANAGED_TEMPLATE_ID_PREFIX)) {
      const key = params.templateId.slice(MANAGED_TEMPLATE_ID_PREFIX.length);
      const template = MANAGED_TEMPLATES_CATALOG.templates.find(
        (candidate) => candidate.key === key,
      );
      return template
        ? definitionFromManagedTemplate(
            template,
            params.variableMapping as LlmEvaluatorVariableMapping,
          )
        : null;
    }
    const version = await this.prisma.evaluatorVersion.findFirst({
      where: {
        id: params.templateId,
        evaluator: { projectId: params.projectId },
      },
      include: { evaluator: { include: { versions: latestVersion } } },
    });
    if (!version) return null;

    const currentVersion = version.evaluator.versions[0];
    if (!currentVersion) return null;

    let variableMapping = params.variableMapping as LlmEvaluatorVariableMapping;
    if (currentVersion.id !== version.id) {
      const preparedMapping = prepareVariableMappingForEvaluatorUpgrade({
        templateType: version.evaluator.type,
        targetObject: params.targetObject,
        variableMapping,
        nextVariables: getEvalTemplateVariables({
          type: version.evaluator.type,
          vars: currentVersion.vars,
        }),
      });
      if (preparedMapping.missingVariables.length > 0) {
        throw new LangfuseConflictError(
          `Evaluator template "${version.evaluator.name}" changed while this form was open. Reload the page and configure the latest version before creating this evaluator. Missing mappings: ${preparedMapping.missingVariables.join(", ")}.`,
        );
      }
      variableMapping = preparedMapping.variableMapping;
    }

    return definitionFromEvaluator(
      { ...version.evaluator, versions: [currentVersion] },
      variableMapping,
    );
  }

  async createConfig(params: {
    projectId: string;
    templateId: string;
    scoreName: string;
    targetObject: EvalTargetObject;
    filter: unknown;
    variableMapping: EvaluatorDefinition["variableMapping"];
    sampling: number;
    delay: number;
    status: JobConfigState;
    timeScope: JobTimeScope[];
    createdByUserId: string | null;
    // Remapping shares the evaluator definition; the source rule is disabled or deleted so it cannot execute in parallel.
    reuseEvaluatorFromRuleId?: string;
    sourceRuleAction?: "mark-inactive" | "delete";
  }) {
    const definition = params.reuseEvaluatorFromRuleId
      ? null
      : await this.getDefinition({
          projectId: params.projectId,
          templateId: params.templateId,
          targetObject: params.targetObject,
          variableMapping: params.variableMapping,
        });
    if (!params.reuseEvaluatorFromRuleId && !definition) return null;

    return this.prisma.$transaction(async (tx) => {
      let evaluatorId: string;
      let sourceAssignmentId: string | undefined;

      if (params.reuseEvaluatorFromRuleId) {
        const sourceRule = await tx.evaluationRule.findFirst({
          where: {
            id: params.reuseEvaluatorFromRuleId,
            projectId: params.projectId,
            targetObject: { in: LEGACY_TARGET_OBJECTS },
          },
          select: {
            assignments: {
              where: {
                evaluator: {
                  versions: { some: { id: params.templateId } },
                },
              },
              select: { id: true, evaluatorId: true },
            },
          },
        });
        if (sourceRule?.assignments.length !== 1) return null;
        const sourceAssignment = sourceRule.assignments[0]!;
        evaluatorId = sourceAssignment.evaluatorId;
        sourceAssignmentId = sourceAssignment.id;
      } else {
        if (!definition) return null;
        const reusableEvaluatorId = await findReusableEvaluatorId({
          tx,
          projectId: params.projectId,
          templateId: params.templateId,
          scoreName: params.scoreName,
          definition,
        });
        evaluatorId =
          reusableEvaluatorId ??
          (
            await tx.evaluator.create({
              data: {
                projectId: params.projectId,
                name: params.scoreName,
                type: definition.type,
                createdByUserId: params.createdByUserId,
                versions: {
                  create: {
                    version: 1,
                    ...evaluatorVersionData(definition, params.createdByUserId),
                  },
                },
              },
            })
          ).id;
      }

      const rule = await tx.evaluationRule.create({
        data: {
          projectId: params.projectId,
          name: params.scoreName,
          targetObject: params.targetObject,
          filter: params.filter as Prisma.InputJsonValue,
          sampling: params.sampling,
          delay: params.delay,
          status: params.status,
          timeScope: params.timeScope,
          createdByUserId: params.createdByUserId,
          assignments: {
            create: {
              projectId: params.projectId,
              evaluatorId,
              variableMapping: (definition?.variableMapping ??
                params.variableMapping) as Prisma.InputJsonValue,
            },
          },
        },
      });

      if (params.reuseEvaluatorFromRuleId && sourceAssignmentId) {
        if (params.sourceRuleAction === "delete") {
          await tx.evaluationRule.delete({
            where: {
              id: params.reuseEvaluatorFromRuleId,
              projectId: params.projectId,
            },
          });
        } else {
          await tx.evaluationRule.update({
            where: {
              id: params.reuseEvaluatorFromRuleId,
              projectId: params.projectId,
            },
            data: { status: JobConfigState.INACTIVE },
          });
        }
      }

      return rule;
    });
  }

  async saveTemplate(params: {
    projectId: string;
    name: string;
    definition: EvaluatorDefinition;
    createdByUserId: string | null;
    intent:
      | { type: "new" }
      | { type: "clone"; cloneSourceId: string }
      | { type: "new-version"; sourceTemplateId: string };
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (params.intent.type === "new-version") {
        const source = await tx.evaluatorVersion.findFirst({
          where: {
            id: params.intent.sourceTemplateId,
            evaluator: { projectId: params.projectId },
          },
          select: { evaluatorId: true },
        });
        if (!source) throw new LangfuseNotFoundError("Evaluator not found");

        // Serialize concurrent version creation: the next version number is
        // read here and written below, and the pair is unique.
        await tx.$executeRaw`SELECT "id" FROM "evaluators" WHERE "id" = ${source.evaluatorId} AND "project_id" = ${params.projectId} FOR UPDATE`;

        const evaluator = await tx.evaluator.findFirstOrThrow({
          where: { id: source.evaluatorId, projectId: params.projectId },
          include: { versions: latestVersion },
        });
        if (
          evaluator.name !== params.name ||
          evaluator.type !== params.definition.type
        ) {
          throw new InvalidRequestError(
            "Evaluator name and type cannot change between versions",
          );
        }

        // Rules run the evaluator's newest version, so a version that adds
        // variables must carry the assignments over or they would execute with
        // an incomplete mapping.
        const assignments = await tx.evaluationRuleEvaluatorAssignment.findMany(
          {
            where: {
              projectId: params.projectId,
              evaluatorId: source.evaluatorId,
            },
            select: {
              id: true,
              variableMapping: true,
              evaluationRule: { select: { name: true, targetObject: true } },
            },
          },
        );
        const upgradedAssignments = prepareConfigsForTemplateUpgrade({
          templateType: params.definition.type,
          configs: assignments.map((assignment) => ({
            id: assignment.id,
            scoreName: assignment.evaluationRule.name,
            targetObject: assignment.evaluationRule.targetObject,
            variableMapping:
              assignment.variableMapping ??
              evaluator.versions[0]?.variableMapping ??
              [],
          })),
          nextVariables: getEvalTemplateVariables({
            type: params.definition.type,
            vars:
              params.definition.type === EvalTemplateType.LLM_AS_JUDGE
                ? params.definition.vars
                : undefined,
          }),
        });

        const version = await tx.evaluatorVersion.create({
          data: {
            evaluatorId: source.evaluatorId,
            version: (evaluator.versions[0]?.version ?? 0) + 1,
            ...evaluatorVersionData(params.definition, params.createdByUserId),
          },
        });
        await Promise.all(
          upgradedAssignments.map((assignment) =>
            tx.evaluationRuleEvaluatorAssignment.update({
              where: { id: assignment.id, projectId: params.projectId },
              data: {
                variableMapping:
                  assignment.variableMapping as Prisma.InputJsonValue,
              },
            }),
          ),
        );

        const template = toLegacyEvaluatorTemplate({
          ...evaluator,
          versions: [version],
        });
        if (!template) {
          throw new LangfuseNotFoundError("Evaluator version was not created");
        }
        return {
          template,
          updatedConfigCount: upgradedAssignments.length,
        };
      }

      if (params.intent.type === "clone") {
        const key = params.intent.cloneSourceId.startsWith(
          MANAGED_TEMPLATE_ID_PREFIX,
        )
          ? params.intent.cloneSourceId.slice(MANAGED_TEMPLATE_ID_PREFIX.length)
          : null;
        const source = key
          ? MANAGED_TEMPLATES_CATALOG.templates.find(
              (candidate) => candidate.key === key,
            )
          : undefined;
        if (!source) {
          throw new LangfuseNotFoundError(
            "Langfuse managed template not found",
          );
        }
        if (source.evaluator.type !== params.definition.type) {
          throw new InvalidRequestError("Evaluator type cannot be changed.");
        }
      }

      const duplicate = await tx.evaluator.findFirst({
        where: { projectId: params.projectId, name: params.name },
        select: { type: true },
      });
      if (duplicate) {
        // "open it to create a new version" is a dead end when the name is
        // taken by an evaluator of a different type (type cannot change)
        throw new LangfuseConflictError(
          duplicate.type === params.definition.type
            ? `An evaluator named "${params.name}" already exists in this project. Open it to create a new version.`
            : `An evaluator named "${params.name}" already exists in this project with a different type. Use a different name.`,
        );
      }
      const evaluator = await tx.evaluator.create({
        data: {
          projectId: params.projectId,
          name: params.name,
          description: null,
          type: params.definition.type,
          createdByUserId: params.createdByUserId,
          versions: {
            create: {
              version: 1,
              ...evaluatorVersionData(
                params.definition,
                params.createdByUserId,
              ),
            },
          },
        },
        include: { versions: latestVersion },
      });
      const template = toLegacyEvaluatorTemplate(evaluator);
      if (!template) {
        throw new LangfuseNotFoundError("Evaluator version was not created");
      }
      return {
        template,
        updatedConfigCount: 0,
      };
    });
  }

  async listTemplateVersions(projectId: string, name: string) {
    const evaluators = await this.prisma.evaluator.findMany({
      where: { projectId, name },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    return evaluators.flatMap((evaluator) =>
      evaluator.versions.flatMap((version) => {
        const template = toLegacyEvaluatorTemplate({
          ...evaluator,
          versions: [version],
        });
        return template && isRunnableTemplate(template) ? [template] : [];
      }),
    );
  }

  async listConfigsByTemplateName(projectId: string, name: string) {
    const rules = await this.prisma.evaluationRule.findMany({
      where: {
        projectId,
        assignments: { some: { evaluator: { name } } },
      },
      include: ruleInclude,
    });
    return rules
      .filter((rule) => rule.assignments.length === 1)
      .map(toLegacyConfig);
  }

  async updateConfig(params: {
    projectId: string;
    ruleId: string;
    data: {
      scoreName?: string;
      filter?: unknown;
      variableMapping?: unknown;
      sampling?: number;
      delay?: number;
      status?: JobConfigState;
      timeScope?: JobTimeScope[];
    };
  }): Promise<LegacyConfig> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.evaluationRule.findFirst({
        where: {
          id: params.ruleId,
          projectId: params.projectId,
          targetObject: { in: LEGACY_TARGET_OBJECTS },
        },
        include: { assignments: true },
      });
      if (!rule || rule.assignments.length !== 1) return null;
      const assignment = rule.assignments[0];
      if (params.data.scoreName !== undefined) {
        await applyScoreNameChange({
          tx,
          projectId: params.projectId,
          assignmentId: assignment.id,
          evaluatorId: assignment.evaluatorId,
          scoreName: params.data.scoreName,
        });
      }
      if (params.data.status === JobConfigState.ACTIVE) {
        // Blocking moved to the evaluator, so activating the rule alone would
        // leave the evaluator paused and the worker would keep skipping it.
        await clearEvaluatorBlock({
          tx,
          projectId: params.projectId,
          assignmentId: assignment.id,
        });
      }
      if (params.data.variableMapping !== undefined) {
        await tx.evaluationRuleEvaluatorAssignment.update({
          where: {
            id: assignment.id,
            projectId: params.projectId,
          },
          data: {
            variableMapping: params.data
              .variableMapping as Prisma.InputJsonValue,
          },
        });
      }
      return tx.evaluationRule.update({
        where: { id: rule.id, projectId: params.projectId },
        data: {
          ...(params.data.filter !== undefined
            ? { filter: params.data.filter as Prisma.InputJsonValue }
            : {}),
          ...(params.data.sampling !== undefined
            ? { sampling: params.data.sampling }
            : {}),
          ...(params.data.delay !== undefined
            ? { delay: params.data.delay }
            : {}),
          ...(params.data.status !== undefined
            ? { status: params.data.status }
            : {}),
          ...(params.data.timeScope !== undefined
            ? { timeScope: params.data.timeScope }
            : {}),
        },
      });
    });
    if (!updated) throw new LangfuseNotFoundError("Evaluation rule not found");
    const config = await this.getConfig(params.projectId, params.ruleId);
    if (!config) {
      throw new LangfuseNotFoundError("Evaluation rule not found after update");
    }
    return config;
  }

  /**
   * Status changes for a set of rules, applied in one statement instead of a
   * per-rule round trip. Activating also clears the evaluator block, matching
   * the single-rule path.
   */
  async setConfigStatuses(params: {
    projectId: string;
    ruleIds: string[];
    status: JobConfigState;
  }) {
    if (params.ruleIds.length === 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.evaluationRule.updateMany({
        where: {
          id: { in: params.ruleIds },
          projectId: params.projectId,
          targetObject: { in: LEGACY_TARGET_OBJECTS },
        },
        data: { status: params.status },
      });

      if (params.status === JobConfigState.ACTIVE) {
        const assignments = await tx.evaluationRuleEvaluatorAssignment.findMany(
          {
            where: {
              projectId: params.projectId,
              evaluationRuleId: { in: params.ruleIds },
            },
            select: { evaluatorId: true },
          },
        );
        await tx.evaluator.updateMany({
          where: {
            projectId: params.projectId,
            id: { in: assignments.map(({ evaluatorId }) => evaluatorId) },
          },
          data: resetEvalConfigBlockFields,
        });
      }

      return count;
    });
  }

  async deleteConfig(projectId: string, ruleId: string) {
    const rule = await this.prisma.evaluationRule.findFirst({
      where: {
        id: ruleId,
        projectId,
        targetObject: { in: LEGACY_TARGET_OBJECTS },
      },
      select: { id: true },
    });
    if (!rule) return false;

    // Executions carry no foreign key, so they have to be removed explicitly
    // or they keep showing up in the eval log of a deleted evaluator. Batched
    // rather than interactive: a long execution history exceeds Prisma's
    // default interactive transaction timeout.
    await this.prisma.$transaction([
      this.prisma.jobExecution.deleteMany({
        where: { projectId, jobConfigurationId: ruleId },
      }),
      this.prisma.evaluationRule.delete({ where: { id: ruleId, projectId } }),
    ]);
    return true;
  }

  async getTemplateUsage(projectId: string, templateId: string) {
    if (templateId.startsWith(MANAGED_TEMPLATE_ID_PREFIX)) {
      return [];
    }
    const version = await this.prisma.evaluatorVersion.findFirst({
      where: { id: templateId, evaluator: { projectId } },
      select: { evaluatorId: true },
    });
    if (!version) return [];
    const rules = await this.prisma.evaluationRule.findMany({
      where: {
        projectId,
        assignments: { some: { evaluatorId: version.evaluatorId } },
      },
      include: ruleInclude,
    });
    // Every referencing rule counts, including modern multi-evaluator ones:
    // this list explains why `deleteTemplate` refuses, so it must not be
    // narrower than the check that refuses.
    return rules.map(toLegacyConfig);
  }

  async deleteTemplate(projectId: string, templateId: string) {
    if (templateId.startsWith(MANAGED_TEMPLATE_ID_PREFIX)) {
      throw new ForbiddenError("Langfuse-managed evaluators cannot be deleted");
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.evaluatorVersion.findFirst({
        where: { id: templateId, evaluator: { projectId } },
        select: { evaluatorId: true },
      });
      if (!version) throw new LangfuseNotFoundError("Evaluator not found");

      // Lock the evaluator so a rule cannot be assigned to it between the
      // usage check and the delete.
      await tx.$executeRaw`SELECT "id" FROM "evaluators" WHERE "id" = ${version.evaluatorId} AND "project_id" = ${projectId} FOR UPDATE`;

      const referencingRules = await tx.evaluationRule.findMany({
        where: {
          projectId,
          assignments: { some: { evaluatorId: version.evaluatorId } },
        },
        select: { name: true },
      });
      if (referencingRules.length > 0) {
        throw new LangfuseConflictError(
          buildTemplateInUseMessage(referencingRules.map(({ name }) => name)),
        );
      }

      const versions = await tx.evaluatorVersion.findMany({
        where: { evaluatorId: version.evaluatorId },
      });
      await tx.evaluator.delete({
        where: { id: version.evaluatorId, projectId },
      });
      return versions;
    });
  }
}
