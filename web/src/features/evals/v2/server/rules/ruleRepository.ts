import {
  JobConfigState,
  Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import type {
  EvalTargetObject,
  FilterState,
  ObservationVariableMapping,
} from "@langfuse/shared";
import type {
  CreateRuleInput,
  ListRulesInput,
  RuleAssignmentInput,
  RuleSelectionInput,
  UpdateRuleInput,
} from "./ruleTypes";

export type RulePrisma = PrismaClient | Prisma.TransactionClient;

const latestVersion = {
  orderBy: { version: "desc" as const },
  take: 1,
  select: { id: true, version: true, variableMapping: true },
};

const assignmentInclude = {
  orderBy: { createdAt: "asc" as const },
  include: {
    evaluator: {
      select: {
        id: true,
        name: true,
        type: true,
        versions: latestVersion,
      },
    },
  },
};

const ruleInclude = {
  createdByUser: { select: { name: true, email: true } },
  assignments: assignmentInclude,
} satisfies Prisma.EvaluationRuleInclude;

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function ruleWhere(params: {
  projectId: string;
  search?: string;
  enabled?: boolean;
}) {
  return {
    projectId: params.projectId,
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" as const } }
      : {}),
    ...(params.enabled === undefined
      ? {}
      : {
          status: params.enabled
            ? JobConfigState.ACTIVE
            : JobConfigState.INACTIVE,
        }),
  };
}

export async function listRules(params: {
  prisma: PrismaClient;
  input: ListRulesInput;
}) {
  const where = ruleWhere(params.input);
  const [rules, totalItems] = await Promise.all([
    params.prisma.evaluationRule.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (params.input.page - 1) * params.input.limit,
      take: params.input.limit,
      include: ruleInclude,
    }),
    params.prisma.evaluationRule.count({ where }),
  ]);
  return { rules, totalItems };
}

export function findRule(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleId: string;
}) {
  return params.prisma.evaluationRule.findFirst({
    where: { id: params.ruleId, projectId: params.projectId },
    include: ruleInclude,
  });
}

export function createRule(params: {
  prisma: RulePrisma;
  input: CreateRuleInput;
  createdByUserId: string | null;
}) {
  return params.prisma.evaluationRule.create({
    data: {
      projectId: params.input.projectId,
      createdByUserId: params.createdByUserId,
      name: params.input.name,
      status: params.input.enabled
        ? JobConfigState.ACTIVE
        : JobConfigState.INACTIVE,
      targetObject: params.input.targetObject,
      filter: params.input.filter as Prisma.InputJsonValue,
      sampling: params.input.sampling,
      delay: 0,
      timeScope: ["NEW"],
      assignments: {
        create: params.input.evaluatorAssignments.map((assignment) => ({
          projectId: params.input.projectId,
          evaluatorId: assignment.evaluatorId,
          variableMapping: jsonValue(assignment.variableMapping),
        })),
      },
    },
    include: ruleInclude,
  });
}

export function updateRule(params: {
  prisma: RulePrisma;
  input: UpdateRuleInput;
  targetObject?: EvalTargetObject;
  filter?: Prisma.InputJsonValue;
}) {
  return params.prisma.evaluationRule.update({
    where: { id: params.input.ruleId, projectId: params.input.projectId },
    data: {
      ...(params.targetObject === undefined
        ? {}
        : { targetObject: params.targetObject }),
      ...(params.input.name === undefined ? {} : { name: params.input.name }),
      ...(params.filter === undefined ? {} : { filter: params.filter }),
      ...(params.input.sampling === undefined
        ? {}
        : { sampling: params.input.sampling }),
      ...(params.input.enabled === undefined
        ? {}
        : {
            status: params.input.enabled
              ? JobConfigState.ACTIVE
              : JobConfigState.INACTIVE,
          }),
    },
    include: ruleInclude,
  });
}

export function setRuleStatus(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleIds?: string[];
  enabled: boolean;
  sampling?: number;
  unassignedOnly?: boolean;
}) {
  const status = params.enabled
    ? JobConfigState.ACTIVE
    : JobConfigState.INACTIVE;
  return params.prisma.evaluationRule.updateMany({
    where: {
      projectId: params.projectId,
      ...(params.ruleIds === undefined ? {} : { id: { in: params.ruleIds } }),
      ...(params.unassignedOnly ? { assignments: { none: {} } } : {}),
      ...(params.sampling === undefined ? { status: { not: status } } : {}),
    },
    data: {
      status,
      ...(params.sampling === undefined ? {} : { sampling: params.sampling }),
    },
  });
}

export async function deleteRule(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleId: string;
}) {
  const result = await params.prisma.evaluationRule.deleteMany({
    where: { id: params.ruleId, projectId: params.projectId },
  });
  return result.count > 0;
}

export async function listSelectedRuleIds(params: {
  prisma: RulePrisma;
  input: RuleSelectionInput;
}) {
  if ("ruleIds" in params.input) {
    const rules = await params.prisma.evaluationRule.findMany({
      where: {
        projectId: params.input.projectId,
        id: { in: params.input.ruleIds },
      },
      select: { id: true },
    });
    return rules.map(({ id }) => id);
  }
  const rules = await params.prisma.evaluationRule.findMany({
    where: ruleWhere(params.input),
    select: { id: true },
  });
  return rules.map(({ id }) => id);
}

export async function replaceAssignments(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleId: string;
  assignments: RuleAssignmentInput[];
}) {
  await params.prisma.evaluationRuleEvaluatorAssignment.deleteMany({
    where: {
      projectId: params.projectId,
      evaluationRuleId: params.ruleId,
    },
  });
  const result =
    await params.prisma.evaluationRuleEvaluatorAssignment.createMany({
      data: params.assignments.map((assignment) => ({
        projectId: params.projectId,
        evaluationRuleId: params.ruleId,
        evaluatorId: assignment.evaluatorId,
        variableMapping: jsonValue(assignment.variableMapping),
      })),
    });
  if (params.assignments.length === 0) {
    await setRuleStatus({
      prisma: params.prisma,
      projectId: params.projectId,
      ruleIds: [params.ruleId],
      enabled: false,
    });
  }
  return result;
}

export function attachEvaluator(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleId: string;
  assignment: RuleAssignmentInput;
}) {
  return params.prisma.evaluationRuleEvaluatorAssignment.create({
    data: {
      projectId: params.projectId,
      evaluationRuleId: params.ruleId,
      evaluatorId: params.assignment.evaluatorId,
      variableMapping: jsonValue(params.assignment.variableMapping),
    },
  });
}

export async function detachEvaluator(params: {
  prisma: RulePrisma;
  projectId: string;
  ruleId: string;
  evaluatorId: string;
}) {
  const result =
    await params.prisma.evaluationRuleEvaluatorAssignment.deleteMany({
      where: {
        projectId: params.projectId,
        evaluationRuleId: params.ruleId,
        evaluatorId: params.evaluatorId,
      },
    });
  if (result.count > 0) {
    await setRuleStatus({
      prisma: params.prisma,
      projectId: params.projectId,
      ruleIds: [params.ruleId],
      enabled: false,
      unassignedOnly: true,
    });
  }
  return result.count > 0;
}

export async function countRulesForEvaluators(params: {
  prisma: RulePrisma;
  projectId: string;
  evaluatorIds: string[];
}) {
  if (params.evaluatorIds.length === 0) return {};

  const counts = await params.prisma.evaluationRuleEvaluatorAssignment.groupBy({
    by: ["evaluatorId"],
    where: {
      projectId: params.projectId,
      evaluatorId: { in: params.evaluatorIds },
    },
    _count: { _all: true },
  });

  return Object.fromEntries(
    counts.map((count) => [count.evaluatorId, count._count._all]),
  );
}

export async function listRulesForEvaluator(params: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorId: string;
}) {
  const assignments =
    await params.prisma.evaluationRuleEvaluatorAssignment.findMany({
      where: {
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
        evaluator: { projectId: params.projectId },
        evaluationRule: { projectId: params.projectId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        variableMapping: true,
        evaluationRule: {
          select: {
            id: true,
            name: true,
            status: true,
            filter: true,
            sampling: true,
          },
        },
      },
    });
  return assignments.map(
    ({ evaluationRule, variableMapping, ...assignment }) => ({
      ...assignment,
      variableMapping: variableMapping as ObservationVariableMapping[] | null,
      evaluationRule: {
        id: evaluationRule.id,
        name: evaluationRule.name,
        enabled: evaluationRule.status === JobConfigState.ACTIVE,
        filter: evaluationRule.filter as FilterState,
        sampling: evaluationRule.sampling.toNumber(),
      },
    }),
  );
}
