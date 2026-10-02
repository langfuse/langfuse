import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import {
  claimDueInAppAgentRoutine,
  fireInAppAgentRoutine,
} from "@langfuse/shared/in-app-agent/server/routineFire";

import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const tickIntervalMs = 30_000;
const lockTtlSeconds = 90;
const DUE_BATCH_SIZE = 50;

const IN_APP_AGENT_ROUTINE_RUNNER_LOCK_KEY =
  "langfuse:in-app-agent-routine-runner";

export class InAppAgentRoutineRunner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return tickIntervalMs;
  }

  constructor() {
    super({
      name: "InAppAgentRoutineRunner",
      metricName: "in_app_agent_routine_runner",
      lockKey: IN_APP_AGENT_ROUTINE_RUNNER_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`);
    super.start();
  }

  protected async execute(): Promise<number | void> {
    return await this.withLock(async () => {
      const now = new Date();
      const due = await prisma.inAppAgentRoutine.findMany({
        where: {
          status: "ACTIVE",
          nextRunAt: { lte: now },
        },
        orderBy: { nextRunAt: "asc" },
        take: DUE_BATCH_SIZE,
      });

      for (const routine of due) {
        await this.extendLockOnProgress();

        const claimed = await claimDueInAppAgentRoutine({
          prisma,
          projectId: routine.projectId,
          routineId: routine.id,
          dueNextRunAt: routine.nextRunAt,
          cron: routine.cron,
          timezone: routine.timezone,
          now,
        });

        if (!claimed) {
          continue;
        }

        try {
          await fireInAppAgentRoutine({ prisma, routine, now });
        } catch (error) {
          logger.error(`${this.instanceName}: failed to fire routine`, {
            projectId: routine.projectId,
            routineId: routine.id,
            error,
          });
        }
      }

      return due.length;
    });
  }
}
