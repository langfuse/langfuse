import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";
import * as repository from "./assignmentRepository";

export class AssignmentService {
  constructor(
    private readonly dependencies: {
      prisma: PrismaClient | Prisma.TransactionClient;
    },
  ) {}

  async countEvaluatorAssignments(projectId: string, evaluatorId: string) {
    const counts = await repository.countEvaluatorAssignments({
      prisma: this.dependencies.prisma,
      projectId,
      evaluatorIds: [evaluatorId],
    });
    return counts[evaluatorId] ?? 0;
  }

  countEvaluatorAssignmentsForEvaluators(
    projectId: string,
    evaluatorIds: string[],
  ) {
    return repository.countEvaluatorAssignments({
      prisma: this.dependencies.prisma,
      projectId,
      evaluatorIds,
    });
  }
}
