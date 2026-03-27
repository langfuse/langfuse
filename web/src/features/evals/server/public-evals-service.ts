import { randomUUID } from "node:crypto";
import {
  EvalTargetObject,
  extractVariables,
  experimentEvalFilterColumns,
  JobConfigState,
  observationEvalFilterColumns,
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
  singleFilter,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import {
  InternalServerError,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type {
  EvalTemplate,
  JobConfiguration,
  Prisma as PrismaNamespace,
} from "@langfuse/shared/src/db";
import {
  invalidateProjectEvalConfigCaches,
  logger,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  type PatchUnstableContinuousEvaluationBodyType,
  type PostUnstableContinuousEvaluationBodyType,
} from "@/src/features/public-api/types/unstable-continuous-evaluations";
import {
  type PatchUnstableEvaluatorBodyType,
  type PostUnstableEvaluatorBodyType,
} from "@/src/features/public-api/types/unstable-evaluators";
import {
  type PublicContinuousEvaluationMappingType,
  type PublicContinuousEvaluationTargetType,
  type PublicEvaluatorModelConfigType,
} from "@/src/features/public-api/types/unstable-evals-shared";

type PrismaClientLike = typeof prisma | PrismaNamespace.TransactionClient;

type PublicModelConfig = PublicEvaluatorModelConfigType;
type PublicTarget = PublicContinuousEvaluationTargetType;
type PublicMapping = PublicContinuousEvaluationMappingType;
type PublicFilter = z.infer<typeof singleFilter>;

type PublicEvaluatorRecord = {
  id: string;
  name: string;
  description: string | null;
  type: "llm_as_judge";
  prompt: string;
  variables: string[];
  outputDefinition: z.infer<typeof PersistedEvalOutputDefinitionSchema>;
  modelConfig: PublicModelConfig | null;
  continuousEvaluationCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type PublicContinuousEvaluationRecord = {
  id: string;
  name: string;
  evaluatorId: string;
  target: PublicTarget;
  enabled: boolean;
  status: "active" | "inactive" | "paused";
  pausedReason: string | null;
  pausedMessage: string | null;
  sampling: number;
  filter: PublicFilter[];
  mapping: PublicMapping[];
  createdAt: Date;
  updatedAt: Date;
};

type PublicEvaluatorTemplate = Pick<
  EvalTemplate,
  | "id"
  | "projectId"
  | "evaluatorId"
  | "name"
  | "description"
  | "version"
  | "prompt"
  | "provider"
  | "model"
  | "modelParams"
  | "vars"
  | "outputDefinition"
  | "createdAt"
  | "updatedAt"
>;

type PublicContinuousEvaluationConfig = Pick<
  JobConfiguration,
  | "id"
  | "projectId"
  | "evalTemplateId"
  | "scoreName"
  | "targetObject"
  | "filter"
  | "variableMapping"
  | "sampling"
  | "status"
  | "blockedAt"
  | "blockReason"
  | "blockMessage"
  | "createdAt"
  | "updatedAt"
> & {
  evalTemplate: Pick<
    EvalTemplate,
    "id" | "projectId" | "evaluatorId" | "name" | "vars" | "prompt"
  > | null;
};

const PUBLIC_TO_INTERNAL_TARGET: Record<PublicTarget, string> = {
  observation: EvalTargetObject.EVENT,
  experiment: EvalTargetObject.EXPERIMENT,
};

const INTERNAL_TO_PUBLIC_TARGET: Record<string, PublicTarget> = {
  [EvalTargetObject.EVENT]: "observation",
  [EvalTargetObject.EXPERIMENT]: "experiment",
};

const PUBLIC_TO_INTERNAL_MAPPING_SOURCE: Record<
  PublicMapping["source"],
  ObservationVariableMapping["selectedColumnId"]
> = {
  input: "input",
  output: "output",
  metadata: "metadata",
  expected_output: "experimentItemExpectedOutput",
};

const INTERNAL_TO_PUBLIC_MAPPING_SOURCE: Record<
  ObservationVariableMapping["selectedColumnId"],
  PublicMapping["source"]
> = {
  input: "input",
  output: "output",
  metadata: "metadata",
  experimentItemExpectedOutput: "expected_output",
};

const OBSERVATION_ALLOWED_SOURCES = new Set<PublicMapping["source"]>([
  "input",
  "output",
  "metadata",
]);

const EXPERIMENT_ALLOWED_SOURCES = new Set<PublicMapping["source"]>([
  "input",
  "output",
  "metadata",
  "expected_output",
]);

const OBSERVATION_FILTER_DEFINITIONS = new Map(
  observationEvalFilterColumns.map((column) => [column.id, column]),
);

const EXPERIMENT_FILTER_DEFINITIONS = new Map([
  [
    "datasetId",
    {
      ...experimentEvalFilterColumns[0],
      id: "datasetId",
    },
  ],
]);

function getClient(client?: PrismaClientLike) {
  return client ?? prisma;
}

function normalizeModelConfig(modelConfig?: PublicModelConfig | null) {
  if (!modelConfig) {
    return {
      provider: null,
      model: null,
      modelParams: undefined,
    };
  }

  return {
    provider: modelConfig.provider,
    model: modelConfig.model,
    modelParams: modelConfig.modelParams ?? undefined,
  };
}

function parseOutputDefinition(
  template: Pick<EvalTemplate, "outputDefinition">,
) {
  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(
    template.outputDefinition,
  );

  if (!parsed.success) {
    logger.error("Failed to parse public evaluator output definition", {
      issues: parsed.error.issues,
      templateId: "id" in template ? template.id : undefined,
    });
    throw new InternalServerError("Evaluator output definition is corrupted");
  }

  return parsed.data;
}

function getEvaluatorVariables(
  template: Pick<EvalTemplate, "vars" | "prompt">,
) {
  return template.vars.length > 0
    ? template.vars
    : extractVariables(template.prompt);
}

function toPublicModelConfig(
  template: Pick<EvalTemplate, "provider" | "model" | "modelParams">,
): PublicModelConfig | null {
  if (!template.provider || !template.model) {
    return null;
  }

  return {
    provider: template.provider,
    model: template.model,
    modelParams: template.modelParams as PublicModelConfig["modelParams"],
  };
}

function getPublicContinuousEvaluationStatus(
  config: Pick<JobConfiguration, "status" | "blockedAt">,
): PublicContinuousEvaluationRecord["status"] {
  if (config.blockedAt) {
    return "paused";
  }

  return config.status === JobConfigState.ACTIVE ? "active" : "inactive";
}

function assertSupportedInternalTarget(targetObject: string): PublicTarget {
  const publicTarget = INTERNAL_TO_PUBLIC_TARGET[targetObject];

  if (!publicTarget) {
    throw new InternalServerError("Continuous evaluation target is corrupted");
  }

  return publicTarget;
}

function normalizePublicFilter(
  filter: PublicFilter,
  target: PublicTarget,
): PublicFilter {
  if (target === "experiment" && filter.column === "datasetId") {
    return {
      ...filter,
      column: "experimentDatasetId",
    };
  }

  return filter;
}

function denormalizeStoredFilter(
  filter: PublicFilter,
  target: PublicTarget,
): PublicFilter {
  if (target === "experiment" && filter.column === "experimentDatasetId") {
    return {
      ...filter,
      column: "datasetId",
    };
  }

  return filter;
}

function validateFilters(filters: PublicFilter[], target: PublicTarget) {
  const definitions =
    target === "observation"
      ? OBSERVATION_FILTER_DEFINITIONS
      : EXPERIMENT_FILTER_DEFINITIONS;

  for (const filter of filters) {
    const definition = definitions.get(filter.column);

    if (!definition) {
      throw new InvalidRequestError(
        `Filter column "${filter.column}" is not supported for target "${target}"`,
      );
    }

    if (filter.type !== definition.type) {
      throw new InvalidRequestError(
        `Filter column "${filter.column}" requires filter type "${definition.type}"`,
      );
    }
  }
}

function normalizeMappings(params: {
  mappings: PublicMapping[];
  target: PublicTarget;
  variables: string[];
}): ObservationVariableMapping[] {
  const { mappings, target, variables } = params;
  const allowedSources =
    target === "observation"
      ? OBSERVATION_ALLOWED_SOURCES
      : EXPERIMENT_ALLOWED_SOURCES;
  const variableSet = new Set(variables);
  const mappedVariables = new Set<string>();

  for (const mapping of mappings) {
    if (!allowedSources.has(mapping.source)) {
      throw new InvalidRequestError(
        `Mapping source "${mapping.source}" is not supported for target "${target}"`,
      );
    }

    if (!variableSet.has(mapping.variable)) {
      throw new InvalidRequestError(
        `Mapping variable "${mapping.variable}" is not present in the evaluator prompt`,
      );
    }

    if (mappedVariables.has(mapping.variable)) {
      throw new InvalidRequestError(
        `Mapping variable "${mapping.variable}" can only be mapped once`,
      );
    }

    mappedVariables.add(mapping.variable);
  }

  const missingVariables = variables.filter(
    (variable) => !mappedVariables.has(variable),
  );

  if (missingVariables.length > 0) {
    throw new InvalidRequestError(
      `Missing mappings for evaluator variables: ${missingVariables.join(", ")}`,
    );
  }

  return observationVariableMappingList.parse(
    mappings.map((mapping) => ({
      templateVariable: mapping.variable,
      selectedColumnId: PUBLIC_TO_INTERNAL_MAPPING_SOURCE[mapping.source],
      jsonSelector: mapping.jsonPath ?? null,
    })),
  );
}

function denormalizeMappings(
  mappings: unknown,
): PublicContinuousEvaluationRecord["mapping"] {
  const parsed = observationVariableMappingList.safeParse(mappings);

  if (!parsed.success) {
    logger.error("Failed to parse public continuous evaluation mappings", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Continuous evaluation mapping is corrupted");
  }

  return parsed.data.map((mapping) => {
    const source = INTERNAL_TO_PUBLIC_MAPPING_SOURCE[mapping.selectedColumnId];

    if (!source) {
      throw new InternalServerError(
        "Continuous evaluation mapping is corrupted",
      );
    }

    return {
      variable: mapping.templateVariable,
      source,
      ...(mapping.jsonSelector ? { jsonPath: mapping.jsonSelector } : {}),
    };
  });
}

function denormalizeFilters(
  filters: unknown,
  target: PublicTarget,
): PublicContinuousEvaluationRecord["filter"] {
  const parsed = zArraySingleFilter.safeParse(filters);

  if (!parsed.success) {
    logger.error("Failed to parse public continuous evaluation filters", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Continuous evaluation filter is corrupted");
  }

  return parsed.data.map((filter) => denormalizeStoredFilter(filter, target));
}

async function ensureEvaluatorNameAvailable(params: {
  client?: PrismaClientLike;
  projectId: string;
  name: string;
  evaluatorId?: string;
}) {
  const { projectId, name, evaluatorId } = params;
  const client = getClient(params.client);

  const conflictingTemplate = await client.evalTemplate.findFirst({
    where: evaluatorId
      ? {
          projectId,
          name,
          NOT: {
            evaluatorId,
          },
        }
      : {
          projectId,
          name,
        },
    select: {
      id: true,
    },
  });

  if (conflictingTemplate) {
    throw new LangfuseConflictError(
      `An evaluator with name "${name}" already exists in this project`,
    );
  }
}

async function getEvaluatorTemplateVersionsOrThrow(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluatorId: string;
}) {
  const client = getClient(params.client);

  const templates = await client.evalTemplate.findMany({
    where: {
      projectId: params.projectId,
      evaluatorId: params.evaluatorId,
    },
    orderBy: {
      version: "asc",
    },
  });

  if (templates.length === 0) {
    throw new LangfuseNotFoundError(
      "Evaluator not found within authorized project",
    );
  }

  return templates as PublicEvaluatorTemplate[];
}

async function getLatestEvaluatorTemplateOrThrow(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluatorId: string;
}) {
  const templates = await getEvaluatorTemplateVersionsOrThrow(params);
  return templates[templates.length - 1] as PublicEvaluatorTemplate;
}

async function getContinuousEvaluationCount(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluatorId: string;
}) {
  const client = getClient(params.client);

  return client.jobConfiguration.count({
    where: {
      projectId: params.projectId,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      evalTemplate: {
        is: {
          projectId: params.projectId,
          evaluatorId: params.evaluatorId,
        },
      },
    },
  });
}

async function mapEvaluatorToPublicRecord(params: {
  client?: PrismaClientLike;
  templates: PublicEvaluatorTemplate[];
  continuousEvaluationCount?: number;
}): Promise<PublicEvaluatorRecord> {
  const { templates } = params;
  const latestTemplate = templates[templates.length - 1];
  const earliestTemplate = templates[0];

  if (!latestTemplate?.evaluatorId) {
    throw new InternalServerError("Evaluator identity is corrupted");
  }
  if (!latestTemplate.projectId) {
    throw new InternalServerError("Evaluator project is corrupted");
  }

  const continuousEvaluationCount =
    params.continuousEvaluationCount ??
    (await getContinuousEvaluationCount({
      client: params.client,
      projectId: latestTemplate.projectId,
      evaluatorId: latestTemplate.evaluatorId,
    }));

  return {
    id: latestTemplate.evaluatorId,
    name: latestTemplate.name,
    description: latestTemplate.description ?? null,
    type: "llm_as_judge",
    prompt: latestTemplate.prompt,
    variables: getEvaluatorVariables(latestTemplate),
    outputDefinition: parseOutputDefinition(latestTemplate),
    modelConfig: toPublicModelConfig(latestTemplate),
    continuousEvaluationCount,
    createdAt: earliestTemplate.createdAt,
    updatedAt: latestTemplate.updatedAt,
  };
}

async function getPublicContinuousEvaluationOrThrow(params: {
  client?: PrismaClientLike;
  projectId: string;
  continuousEvaluationId: string;
}) {
  const client = getClient(params.client);

  const config = await client.jobConfiguration.findFirst({
    where: {
      id: params.continuousEvaluationId,
      projectId: params.projectId,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      evalTemplate: {
        is: {
          projectId: params.projectId,
          evaluatorId: {
            not: null,
          },
        },
      },
    },
    include: {
      evalTemplate: {
        select: {
          id: true,
          projectId: true,
          evaluatorId: true,
          name: true,
          vars: true,
          prompt: true,
        },
      },
    },
  });

  if (!config) {
    throw new LangfuseNotFoundError(
      "Continuous evaluation not found within authorized project",
    );
  }

  return config as PublicContinuousEvaluationConfig;
}

function mapContinuousEvaluationToPublicRecord(
  config: PublicContinuousEvaluationConfig,
): PublicContinuousEvaluationRecord {
  if (!config.evalTemplate?.evaluatorId) {
    throw new InternalServerError(
      "Continuous evaluation evaluator is corrupted",
    );
  }

  const target = assertSupportedInternalTarget(config.targetObject);

  return {
    id: config.id,
    name: config.scoreName,
    evaluatorId: config.evalTemplate.evaluatorId,
    target,
    enabled: config.status === JobConfigState.ACTIVE,
    status: getPublicContinuousEvaluationStatus(config),
    pausedReason: config.blockReason ?? null,
    pausedMessage: config.blockMessage ?? null,
    sampling: Number(config.sampling),
    filter: denormalizeFilters(config.filter, target),
    mapping: denormalizeMappings(config.variableMapping),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

async function getEvaluatorTemplateForContinuousEvaluation(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluatorId: string;
}) {
  const template = await getLatestEvaluatorTemplateOrThrow(params);

  return {
    template,
    variables: getEvaluatorVariables(template),
  };
}

function buildContinuousEvaluationWriteModel(params: {
  input: {
    name: string;
    target: PublicTarget;
    enabled: boolean;
    sampling: number;
    filter: PublicFilter[];
    mapping: PublicMapping[];
  };
  evaluatorVariables: string[];
}) {
  const normalizedFilters = params.input.filter.map((filter) =>
    normalizePublicFilter(filter, params.input.target),
  );

  validateFilters(normalizedFilters, params.input.target);

  return {
    scoreName: params.input.name,
    targetObject: PUBLIC_TO_INTERNAL_TARGET[params.input.target],
    filter: normalizedFilters,
    variableMapping: normalizeMappings({
      mappings: params.input.mapping,
      target: params.input.target,
      variables: params.evaluatorVariables,
    }),
    sampling: params.input.sampling,
    status: params.input.enabled
      ? JobConfigState.ACTIVE
      : JobConfigState.INACTIVE,
  };
}

export async function listPublicEvaluators(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const templates = await prisma.evalTemplate.findMany({
    where: {
      projectId: params.projectId,
      evaluatorId: {
        not: null,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { version: "desc" }],
  });

  const grouped = new Map<string, PublicEvaluatorTemplate[]>();

  for (const template of templates) {
    if (!template.evaluatorId) continue;
    const existing = grouped.get(template.evaluatorId) ?? [];
    existing.push(template as PublicEvaluatorTemplate);
    grouped.set(template.evaluatorId, existing);
  }

  const evaluatorGroups = Array.from(grouped.values())
    .map((group) => group.sort((a, b) => a.version - b.version))
    .sort(
      (left, right) =>
        right[right.length - 1]!.updatedAt.getTime() -
        left[left.length - 1]!.updatedAt.getTime(),
    );

  const totalItems = evaluatorGroups.length;
  const start = (params.page - 1) * params.limit;
  const pagedGroups = evaluatorGroups.slice(start, start + params.limit);
  const evaluatorIds = pagedGroups
    .map((group) => group[group.length - 1]?.evaluatorId)
    .filter((id): id is string => Boolean(id));

  const configs = await prisma.jobConfiguration.findMany({
    where: {
      projectId: params.projectId,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      evalTemplate: {
        is: {
          projectId: params.projectId,
          evaluatorId: {
            in: evaluatorIds,
          },
        },
      },
    },
    select: {
      evalTemplate: {
        select: {
          evaluatorId: true,
        },
      },
    },
  });

  const counts = configs.reduce<Record<string, number>>((acc, config) => {
    const evaluatorId = config.evalTemplate?.evaluatorId;
    if (!evaluatorId) {
      return acc;
    }
    acc[evaluatorId] = (acc[evaluatorId] ?? 0) + 1;
    return acc;
  }, {});

  const data = await Promise.all(
    pagedGroups.map((group) =>
      mapEvaluatorToPublicRecord({
        templates: group,
        continuousEvaluationCount:
          counts[group[group.length - 1]!.evaluatorId as string] ?? 0,
      }),
    ),
  );

  return {
    data,
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}

export async function getPublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
}) {
  const templates = await getEvaluatorTemplateVersionsOrThrow(params);
  return mapEvaluatorToPublicRecord({ templates });
}

export async function createPublicEvaluator(params: {
  projectId: string;
  input: PostUnstableEvaluatorBodyType;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureEvaluatorNameAvailable({
      client: tx,
      projectId: params.projectId,
      name: params.input.name,
    });

    const evaluatorId = randomUUID();
    const variables = extractVariables(params.input.prompt);
    const modelConfig = normalizeModelConfig(params.input.modelConfig);

    await tx.evalTemplate.create({
      data: {
        projectId: params.projectId,
        evaluatorId,
        name: params.input.name,
        description: params.input.description ?? null,
        version: 1,
        prompt: params.input.prompt,
        provider: modelConfig.provider,
        model: modelConfig.model,
        modelParams: modelConfig.modelParams,
        vars: variables,
        outputDefinition: params.input.outputDefinition,
      },
    });

    const templates = await getEvaluatorTemplateVersionsOrThrow({
      client: tx,
      projectId: params.projectId,
      evaluatorId,
    });

    return mapEvaluatorToPublicRecord({
      client: tx,
      templates,
      continuousEvaluationCount: 0,
    });
  });
}

export async function updatePublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
  input: PatchUnstableEvaluatorBodyType;
}) {
  return prisma.$transaction(async (tx) => {
    const templates = await getEvaluatorTemplateVersionsOrThrow({
      client: tx,
      projectId: params.projectId,
      evaluatorId: params.evaluatorId,
    });
    const latestTemplate = templates[templates.length - 1]!;

    const nextName = params.input.name ?? latestTemplate.name;
    await ensureEvaluatorNameAvailable({
      client: tx,
      projectId: params.projectId,
      name: nextName,
      evaluatorId: params.evaluatorId,
    });

    const nextPrompt = params.input.prompt ?? latestTemplate.prompt;
    const nextModelConfig = normalizeModelConfig(
      params.input.modelConfig ?? toPublicModelConfig(latestTemplate),
    );

    const createdTemplate = await tx.evalTemplate.create({
      data: {
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
        name: nextName,
        description:
          params.input.description !== undefined
            ? params.input.description
            : latestTemplate.description,
        version: latestTemplate.version + 1,
        prompt: nextPrompt,
        provider: nextModelConfig.provider,
        model: nextModelConfig.model,
        modelParams: nextModelConfig.modelParams,
        vars: extractVariables(nextPrompt),
        outputDefinition:
          params.input.outputDefinition ??
          parseOutputDefinition(latestTemplate),
      },
    });

    await tx.jobConfiguration.updateMany({
      where: {
        projectId: params.projectId,
        evalTemplateId: {
          in: templates.map((template) => template.id),
        },
      },
      data: {
        evalTemplateId: createdTemplate.id,
      },
    });

    const updatedTemplates = [
      ...templates,
      createdTemplate as PublicEvaluatorTemplate,
    ];
    const continuousEvaluationCount = await getContinuousEvaluationCount({
      client: tx,
      projectId: params.projectId,
      evaluatorId: params.evaluatorId,
    });

    return mapEvaluatorToPublicRecord({
      client: tx,
      templates: updatedTemplates,
      continuousEvaluationCount,
    });
  });
}

export async function deletePublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
}) {
  const templates = await getEvaluatorTemplateVersionsOrThrow(params);
  const continuousEvaluationCount = await getContinuousEvaluationCount(params);

  if (continuousEvaluationCount > 0) {
    throw new LangfuseConflictError(
      "Evaluator cannot be deleted while continuous evaluations still reference it",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.evalTemplate.deleteMany({
      where: {
        id: {
          in: templates.map((template) => template.id),
        },
      },
    });
  });
}

export async function listPublicContinuousEvaluations(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const [configs, totalItems] = await Promise.all([
    prisma.jobConfiguration.findMany({
      where: {
        projectId: params.projectId,
        targetObject: {
          in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
        },
        evalTemplate: {
          is: {
            projectId: params.projectId,
            evaluatorId: {
              not: null,
            },
          },
        },
      },
      include: {
        evalTemplate: {
          select: {
            id: true,
            projectId: true,
            evaluatorId: true,
            name: true,
            vars: true,
            prompt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: params.limit,
      skip: (params.page - 1) * params.limit,
    }),
    prisma.jobConfiguration.count({
      where: {
        projectId: params.projectId,
        targetObject: {
          in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
        },
        evalTemplate: {
          is: {
            projectId: params.projectId,
            evaluatorId: {
              not: null,
            },
          },
        },
      },
    }),
  ]);

  return {
    data: configs.map((config) =>
      mapContinuousEvaluationToPublicRecord(
        config as PublicContinuousEvaluationConfig,
      ),
    ),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}

export async function getPublicContinuousEvaluation(params: {
  projectId: string;
  continuousEvaluationId: string;
}) {
  const config = await getPublicContinuousEvaluationOrThrow(params);
  return mapContinuousEvaluationToPublicRecord(config);
}

export async function createPublicContinuousEvaluation(params: {
  projectId: string;
  input: PostUnstableContinuousEvaluationBodyType;
}) {
  const { template, variables } =
    await getEvaluatorTemplateForContinuousEvaluation({
      projectId: params.projectId,
      evaluatorId: params.input.evaluatorId,
    });

  const data = buildContinuousEvaluationWriteModel({
    input: {
      name: params.input.name,
      target: params.input.target,
      enabled: params.input.enabled,
      sampling: params.input.sampling,
      filter: params.input.filter,
      mapping: params.input.mapping,
    },
    evaluatorVariables: variables,
  });

  const created = await prisma.jobConfiguration.create({
    data: {
      projectId: params.projectId,
      jobType: "EVAL",
      evalTemplateId: template.id,
      scoreName: data.scoreName,
      targetObject: data.targetObject,
      filter: data.filter,
      variableMapping: data.variableMapping,
      sampling: data.sampling,
      delay: 0,
      status: data.status,
      timeScope: ["NEW"],
    },
    include: {
      evalTemplate: {
        select: {
          id: true,
          projectId: true,
          evaluatorId: true,
          name: true,
          vars: true,
          prompt: true,
        },
      },
    },
  });

  if (created.status === JobConfigState.ACTIVE) {
    await invalidateProjectEvalConfigCaches(params.projectId);
  }

  return mapContinuousEvaluationToPublicRecord(
    created as PublicContinuousEvaluationConfig,
  );
}

export async function updatePublicContinuousEvaluation(params: {
  projectId: string;
  continuousEvaluationId: string;
  input: PatchUnstableContinuousEvaluationBodyType;
}) {
  const existing = await getPublicContinuousEvaluationOrThrow({
    projectId: params.projectId,
    continuousEvaluationId: params.continuousEvaluationId,
  });
  const existingPublic = mapContinuousEvaluationToPublicRecord(existing);

  const nextEvaluatorId =
    params.input.evaluatorId ?? existingPublic.evaluatorId;
  const { template, variables } =
    await getEvaluatorTemplateForContinuousEvaluation({
      projectId: params.projectId,
      evaluatorId: nextEvaluatorId,
    });

  const data = buildContinuousEvaluationWriteModel({
    input: {
      name: params.input.name ?? existingPublic.name,
      target: params.input.target ?? existingPublic.target,
      enabled: params.input.enabled ?? existingPublic.enabled,
      sampling: params.input.sampling ?? existingPublic.sampling,
      filter: params.input.filter ?? existingPublic.filter,
      mapping: params.input.mapping ?? existingPublic.mapping,
    },
    evaluatorVariables: variables,
  });

  const updated = await prisma.jobConfiguration.update({
    where: {
      id: params.continuousEvaluationId,
      projectId: params.projectId,
    },
    data: {
      evalTemplateId: template.id,
      scoreName: data.scoreName,
      targetObject: data.targetObject,
      filter: data.filter,
      variableMapping: data.variableMapping,
      sampling: data.sampling,
      status: data.status,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    },
    include: {
      evalTemplate: {
        select: {
          id: true,
          projectId: true,
          evaluatorId: true,
          name: true,
          vars: true,
          prompt: true,
        },
      },
    },
  });

  await invalidateProjectEvalConfigCaches(params.projectId);

  return mapContinuousEvaluationToPublicRecord(
    updated as PublicContinuousEvaluationConfig,
  );
}

export async function deletePublicContinuousEvaluation(params: {
  projectId: string;
  continuousEvaluationId: string;
}) {
  const existing = await getPublicContinuousEvaluationOrThrow(params);

  await prisma.jobConfiguration.delete({
    where: {
      id: params.continuousEvaluationId,
      projectId: params.projectId,
    },
  });

  await invalidateProjectEvalConfigCaches(params.projectId);

  return existing;
}

const zArraySingleFilter = z.array(singleFilter);
