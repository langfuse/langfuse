import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  EvalTemplateType,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  generateLangfuseAIText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getRecentEvaluatorExecutionTraces,
  getTotalCostByEvaluatorIds,
  invalidateProjectEvalConfigCaches,
  logger,
} from "@langfuse/shared/src/server";
import { resolveLangfuseAiFeatureAvailability } from "@/src/features/ai-features/server/availability";
import type {
  CreateEvaluatorInput,
  DeleteEvaluatorsInput,
  EvaluatorDefinition,
  EvaluatorVersionCursor,
  UpdateEvaluatorInput,
} from "./evaluatorTypes";
import {
  encodeEvaluatorVersionCursor,
  EvaluatorDefinitionSchema,
} from "./evaluatorTypes";
import { testEvaluator as executeEvaluatorTest } from "./testEvaluator";
import * as repository from "./evaluatorRepository";
import { assertEvaluatorConfigurationValid } from "./evaluatorValidation";

type SuggestEvaluatorNameParams = {
  projectId: string;
  userId: string | null;
  definition: Pick<EvaluatorDefinition, "type"> &
    ({ prompt: string } | { sourceCode: string });
};

type EvaluatorExecutionTrace = {
  id: string;
  level: string;
  timestamp: Date;
};

export type EvaluatorAuditEvent = {
  action: "create" | "update" | "delete";
  projectId: string;
  evaluatorId: string;
};

// Persisted evaluators carry cuids; only the client-side draft ids the setup
// editor generates before the first save are UUIDs.
const isPregeneratedEvaluatorId = (evaluatorId: string) =>
  z.uuid().safeParse(evaluatorId).success;

export class EvaluatorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: (event: EvaluatorAuditEvent) => Promise<void>,
  ) {}

  list(params: { projectId: string; page: number; limit: number }) {
    return repository.listEvaluators({
      prisma: this.prisma,
      ...params,
    });
  }

  async get(projectId: string, evaluatorId: string) {
    const evaluator = await repository.findEvaluator({
      prisma: this.prisma,
      projectId,
      evaluatorId,
    });
    if (!evaluator) throw new LangfuseNotFoundError("Evaluator not found");
    return evaluator;
  }

  async listVersions(params: {
    projectId: string;
    evaluatorId: string;
    cursor?: EvaluatorVersionCursor;
    limit: number;
  }) {
    const page = await repository.listEvaluatorVersions({
      prisma: this.prisma,
      ...params,
      cursor: params.cursor?.version,
    });
    if (page.data.length === 0 && params.cursor === undefined) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    return {
      ...page,
      nextCursor:
        page.nextCursor === undefined
          ? undefined
          : encodeEvaluatorVersionCursor({ v: 1, version: page.nextCursor }),
    };
  }

  async listRecent(params: { projectId: string; evaluatorIds: string[] }) {
    const result = Object.fromEntries(
      params.evaluatorIds.map((evaluatorId) => [evaluatorId, []]),
    ) as Record<string, EvaluatorExecutionTrace[]>;
    if (params.evaluatorIds.length === 0) return result;

    const traces = await getRecentEvaluatorExecutionTraces(
      params.projectId,
      params.evaluatorIds,
    );

    for (const trace of traces) {
      result[trace.evaluatorId]?.push({
        id: trace.id,
        level: trace.level,
        timestamp: trace.timestamp,
      });
    }

    return result;
  }

  async getTotalCosts(params: { projectId: string; evaluatorIds: string[] }) {
    const costs = await getTotalCostByEvaluatorIds(
      params.projectId,
      params.evaluatorIds,
    );
    return Object.fromEntries(
      costs.map(({ evaluatorId, totalCost }) => [evaluatorId, totalCost]),
    );
  }

  async create(input: CreateEvaluatorInput, createdByUserId: string | null) {
    await assertEvaluatorConfigurationValid(input);
    const evaluator = await this.prisma
      .$transaction((prisma) =>
        repository.createEvaluator({ prisma, input, createdByUserId }),
      )
      .catch((error) => {
        // Callers may pre-generate the id so test runs can be attributed
        // before the first save. Ids are globally unique, so a collision with
        // another project must not surface as an unhandled 500.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new LangfuseConflictError(
            "An evaluator with this id already exists",
          );
        }
        throw error;
      });
    await this.audit({
      action: "create",
      projectId: input.projectId,
      evaluatorId: evaluator.id,
    });
    return evaluator;
  }

  // Temporary fallback for the unstable Evaluators API until the final API
  // exposes explicit create and update semantics.
  async upsertByName(
    input: CreateEvaluatorInput,
    createdByUserId: string | null,
  ) {
    await assertEvaluatorConfigurationValid(input);
    const result = await this.prisma.$transaction(async (prisma) => {
      const matches = await repository.findEvaluatorsByName({
        prisma,
        projectId: input.projectId,
        name: input.name,
      });
      if (matches.length > 1) {
        throw new LangfuseConflictError(
          `Multiple evaluators named "${input.name}" exist in this project`,
        );
      }

      const existing = matches[0];
      if (!existing) {
        return {
          action: "create" as const,
          evaluator: await repository.createEvaluator({
            prisma,
            input,
            createdByUserId,
          }),
        };
      }
      if (existing.type !== input.definition.type) {
        throw new LangfuseConflictError(
          `An evaluator named "${input.name}" already exists with a different type`,
        );
      }

      return {
        action: "update" as const,
        evaluator: await updateEvaluator({
          tx: prisma,
          input: {
            ...input,
            evaluatorId: existing.id,
            description: existing.description,
          },
          createdByUserId,
          forceNewVersion: true,
        }),
      };
    });
    await this.audit({
      action: result.action,
      projectId: input.projectId,
      evaluatorId: result.evaluator.id,
    });
    return result;
  }

  async update(
    input: UpdateEvaluatorInput,
    createdByUserId: string | null,
    options?: { forceNewVersion?: boolean },
  ) {
    await assertEvaluatorConfigurationValid(input);
    const evaluator = await this.prisma.$transaction((tx) =>
      updateEvaluator({
        tx,
        input,
        createdByUserId,
        forceNewVersion: options?.forceNewVersion ?? false,
      }),
    );
    await this.audit({
      action: "update",
      projectId: input.projectId,
      evaluatorId: evaluator.id,
    });
    return evaluator;
  }

  async delete(projectId: string, evaluatorId: string) {
    await this.prisma.$transaction((prisma) =>
      deleteEvaluator({ prisma, projectId, evaluatorId }),
    );
    await invalidateProjectEvalConfigCaches(projectId);
    await this.audit({ action: "delete", projectId, evaluatorId });
  }

  async deleteMany(input: DeleteEvaluatorsInput) {
    const evaluatorIds = await this.prisma.$transaction(async (prisma) => {
      const ids =
        "evaluatorIds" in input
          ? input.evaluatorIds
          : await repository.listEvaluatorIds({
              prisma,
              projectId: input.projectId,
              search: input.search,
            });

      for (const evaluatorId of ids) {
        await deleteEvaluator({
          prisma,
          projectId: input.projectId,
          evaluatorId,
        });
      }
      return ids;
    });
    await invalidateProjectEvalConfigCaches(input.projectId);
    await Promise.all(
      evaluatorIds.map((evaluatorId) =>
        this.audit({
          action: "delete",
          projectId: input.projectId,
          evaluatorId,
        }),
      ),
    );
    return evaluatorIds;
  }

  async testEvaluator(params: Parameters<typeof executeEvaluatorTest>[0]) {
    const evaluator = await this.prisma.evaluator.findFirst({
      where: { id: params.evaluatorId, projectId: params.projectId },
      select: { id: true },
    });
    // The setup editor pre-generates a UUID so a test run can be attributed to
    // the evaluator before it is first saved. Every other id must resolve
    // inside the project — never look it up unscoped, which would turn the
    // response into a cross-project existence oracle.
    if (!evaluator && !isPregeneratedEvaluatorId(params.evaluatorId)) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    return executeEvaluatorTest(params);
  }

  async suggestName(params: SuggestEvaluatorNameParams) {
    const availability = await resolveLangfuseAiFeatureAvailability({
      prisma: this.prisma,
      projectId: params.projectId,
    });
    if (!availability.available) {
      return null;
    }

    try {
      const generated = await defaultNameGenerator(params, availability.model);
      return (
        generated
          ?.trim()
          .replace(/^['\"]|['\"]$/g, "")
          .slice(0, 200) || null
      );
    } catch (error) {
      logger.warn("Evaluator name generation failed", {
        projectId: params.projectId,
        error,
      });
      return null;
    }
  }
}

async function deleteEvaluator(params: {
  prisma: Prisma.TransactionClient;
  projectId: string;
  evaluatorId: string;
}) {
  const deleted = await repository.deleteEvaluator(params);
  if (!deleted) throw new LangfuseNotFoundError("Evaluator not found");
}

async function updateEvaluator(params: {
  tx: Prisma.TransactionClient;
  input: UpdateEvaluatorInput;
  createdByUserId: string | null;
  forceNewVersion: boolean;
}) {
  const { tx, input, createdByUserId } = params;
  const current = await repository.findEvaluator({
    prisma: tx,
    projectId: input.projectId,
    evaluatorId: input.evaluatorId,
  });
  if (!current) throw new LangfuseNotFoundError("Evaluator not found");
  if (current.type !== input.definition.type) {
    throw new LangfuseConflictError("Evaluator type cannot be changed");
  }

  await repository.updateEvaluatorMetadata({
    tx,
    projectId: input.projectId,
    evaluatorId: input.evaluatorId,
    name: input.name,
    description: input.description,
  });

  const latest = current.versions[0];
  if (!latest) throw new LangfuseNotFoundError("Evaluator version not found");
  // Name-based upserts from the unstable API preserve every write as a new
  // version. Stable ID-based updates only version actual definition changes.
  if (
    params.forceNewVersion ||
    !isDeepStrictEqual(
      toEvaluatorDefinition(current.type, latest),
      input.definition,
    )
  ) {
    await repository.appendEvaluatorVersion({
      tx,
      evaluatorId: input.evaluatorId,
      version: latest.version + 1,
      definition: input.definition,
      createdByUserId,
    });
  }

  const updated = await repository.findEvaluator({
    prisma: tx,
    projectId: input.projectId,
    evaluatorId: input.evaluatorId,
  });
  if (!updated) throw new LangfuseNotFoundError("Evaluator not found");
  return updated;
}

export function toEvaluatorDefinition(
  type: EvalTemplateType,
  version: {
    prompt: string | null;
    provider: string | null;
    model: string | null;
    modelParams: unknown;
    vars: string[];
    variableMapping: unknown;
    outputDefinition: unknown;
    sourceCode: string | null;
    sourceCodeLanguage: "PYTHON" | "TYPESCRIPT" | null;
  },
) {
  return EvaluatorDefinitionSchema.parse(
    type === EvalTemplateType.LLM_AS_JUDGE
      ? {
          type,
          prompt: version.prompt ?? "",
          provider: version.provider,
          model: version.model,
          modelParams: version.modelParams,
          vars: version.vars,
          variableMapping: version.variableMapping,
          outputDefinition: version.outputDefinition,
        }
      : {
          type,
          sourceCode: version.sourceCode ?? "",
          sourceCodeLanguage: version.sourceCodeLanguage ?? "PYTHON",
          variableMapping: version.variableMapping,
        },
  );
}

async function defaultNameGenerator(
  params: SuggestEvaluatorNameParams,
  model: string,
) {
  const definition =
    "prompt" in params.definition
      ? params.definition.prompt
      : params.definition.sourceCode;
  return generateLangfuseAIText({
    messages: [
      {
        role: ChatMessageRole.System,
        content:
          "Return only a concise, human-readable evaluator name of at most six words. Do not use quotes or punctuation at the end.",
        type: ChatMessageType.System,
      },
      {
        role: ChatMessageRole.User,
        content: definition.slice(0, 12_000),
        type: ChatMessageType.User,
      },
    ],
    model,
    maxTokens: 40,
    timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
  });
}
