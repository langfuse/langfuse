import { z } from "zod";

import {
  EvalEvent,
  EvalExecutionEvent,
  QueueJobs,
  QueueName,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
  tracesTableCols,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { evalQueue } from "./redis/consumer";

export const createEvalJobs = async ({
  data,
}: {
  data: z.infer<typeof EvalEvent>;
}) => {
  const configs = await kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where("job_type", "=", "evaluation")
    .where("project_id", "=", data.data.projectId)
    .execute();

  for (const config of configs) {
    const validatedFilter = z.array(singleFilter).parse(config.filter);

    const condition = tableColumnsToSqlFilterAndPrefix(
      validatedFilter,
      tracesTableCols,
      "traces"
    );

    const joinedQuery = Prisma.sql`
        SELECT id
        FROM traces as t
        WHERE project_id = ${data.data.projectId}
        AND id = ${data.data.traceId}
        ${condition}
      `;

    const traces = await prisma.$queryRaw<Array<{ id: string }>>(joinedQuery);

    console.log("Number of matched traces", traces.length);

    if (traces.length > 0) {
      console.log(
        `Trace with id ${traces[0].id} found to eval for config ${config.id}. Creating job instance `
      );

      const jobId = randomUUID();
      await kyselyPrisma.$kysely
        .insertInto("job_executions")
        .values({
          id: jobId,
          project_id: data.data.projectId,
          job_configuration_id: config.id,
          trace_id: data.data.traceId,
          status: "running",
        })
        .execute();

      evalQueue.add(QueueName.Evaluation_Execution, {
        name: QueueJobs.Evaluation_Execution,
        payload: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          data: {
            projectId: data.data.projectId,
            jobId: jobId,
          },
        },
      });
    }
  }
};

export const evaluate = async ({
  data,
}: {
  data: z.infer<typeof EvalExecutionEvent>;
}) => {
  console.log(
    `Evaluating job ${data.data.jobId} for project ${data.data.projectId}`
  );
  const job = await kyselyPrisma.$kysely
    .selectFrom("job_executions")
    .selectAll()
    .where("id", "=", data.data.jobId)
    .where("project_id", "=", data.data.projectId)
    .execute();

  const config = await kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where("id", "=", job[0].job_configuration_id)
    .execute();

  const template = await kyselyPrisma.$kysely
    .selectFrom("eval_templates")
    .selectAll()
    .where("id", "=", config[0].eval_template_id)
    .execute();

  console.log(
    `Evaluating job ${job[0].id} for project ${data.data.projectId} with template ${template[0].id}`
  );
};
