import { z } from "zod";

import {
  ChatMessageRole,
  EvalEvent,
  EvalExecutionEvent,
  ModelProvider,
  QueueJobs,
  QueueName,
  ScoreSource,
  fetchLLMCompletion,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
  tracesTableCols,
  variableMappingList,
  observationsTableCols,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { evalQueue } from "./redis/consumer";
import { sql } from "kysely";
import Handlebars from "handlebars";
import {
  JobExecution,
  EvalTemplate,
} from "@langfuse/shared/prisma/generated/types";

// this function is used to determine which eval jobs to create for a given trace
// there might be multiple eval jobs to create for a single trace
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

      const jobExecutionId = randomUUID();
      await kyselyPrisma.$kysely
        .insertInto("job_executions")
        .values({
          id: jobExecutionId,
          project_id: data.data.projectId,
          job_configuration_id: config.id,
          trace_id: data.data.traceId,
          status: "running",
        })
        .execute();

      evalQueue.add(
        QueueName.Evaluation_Execution,
        {
          name: QueueJobs.Evaluation_Execution,
          payload: {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            data: {
              projectId: data.data.projectId,
              jobExecutionId: jobExecutionId,
            },
          },
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          delay: config.delay, // milliseconds
        }
      );
    }
  }
};

// for a single eval job, this function is used to evaluate the job
export const evaluate = async ({
  data,
}: {
  data: z.infer<typeof EvalExecutionEvent>;
}) => {
  console.log(
    `Evaluating job ${data.data.jobExecutionId} for project ${data.data.projectId}`
  );
  const job = await kyselyPrisma.$kysely
    .selectFrom("job_executions")
    .selectAll()
    .where("id", "=", data.data.jobExecutionId)
    .where("project_id", "=", data.data.projectId)
    .executeTakeFirstOrThrow();

  if (!job.trace_id) {
    throw new Error("Jobs can only be executed on traces for now.");
  }

  const config = await kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where("id", "=", job.job_configuration_id)
    .executeTakeFirstOrThrow();

  const template = await kyselyPrisma.$kysely
    .selectFrom("eval_templates")
    .selectAll()
    .where("id", "=", config.eval_template_id)
    .executeTakeFirstOrThrow();

  console.log(
    `Evaluating job ${job.id} for project ${data.data.projectId} with template ${template.id}. Searching for context...`
  );

  const parsedVariableMapping = variableMappingList.parse(
    config.variable_mapping
  );

  console.log("Parsed variable mapping", parsedVariableMapping);

  const mappingResult = await extractVariablesFromTrace(
    template.vars,
    job.trace_id,
    parsedVariableMapping
  );

  const prompt = compileHandlebarString(template.prompt, {
    ...Object.fromEntries(
      mappingResult.map(({ var: key, value }) => [key, value])
    ),
  });

  const parsedOutputSchema = z
    .object({
      score: z.string(),
      reasoning: z.string(),
    })
    .parse(template.output_schema);

  if (!parsedOutputSchema) {
    throw new Error("Output schema not found");
  }

  const openAIFunction = z.object({
    score: z.number().describe(parsedOutputSchema.score),
    reasoning: z.string().describe(parsedOutputSchema.reasoning),
  });

  const completion = await fetchLLMCompletion({
    streaming: false,
    messages: [{ role: ChatMessageRole.System, content: prompt }],
    modelParams: {
      provider: ModelProvider.OpenAI,
      model: "gpt-4",
    },
    functionCall: {
      name: "evalutate",
      description: "some description",
      parameters: openAIFunction,
    },
  });

  const parsedLLMOutput = openAIFunction.parse(completion);

  const scoreId = randomUUID();
  await kyselyPrisma.$kysely
    .insertInto("scores")
    .values({
      id: scoreId,
      trace_id: job.trace_id,
      name: config.score_name,
      value: parsedLLMOutput.score,
      comment: parsedLLMOutput.reasoning,
      source: sql`${ScoreSource.MODEL_BASED_EVALUATION}::"ScoreSource"`,
    })
    .execute();

  await kyselyPrisma.$kysely
    .updateTable("job_executions")
    .set("status", "completed")
    .set("end_time", new Date())
    .set("score_id", scoreId)
    .where("id", "=", data.data.jobExecutionId)
    .execute();
};

export function compileHandlebarString(
  handlebarString: string,
  context: Record<string, any>
): string {
  const template = Handlebars.compile(handlebarString);
  return template(context);
}

async function extractVariablesFromTrace(
  variables: string[],
  traceId: string,
  variableMapping: z.infer<typeof variableMappingList>
) {
  const mappingResult: { var: string; value: string }[] = [];

  for (const variable of variables) {
    console.log(`Searching for context for variable ${variable}`);

    const mapping = variableMapping.find(
      (m) => m.templateVariable === variable
    );

    if (!mapping) {
      console.log(`No mapping found for variable ${variable}`);
      mappingResult.push({ var: variable, value: "" });
      continue; // no need to fetch additional data
    }

    if (mapping.langfuseObject === "trace") {
      const column = tracesTableCols.find(
        (col) => col.id === mapping.selectedColumnId
      );

      if (!column?.id) {
        console.log(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      const trace = await kyselyPrisma.$kysely
        .selectFrom("traces as t")
        .select(sql<string>`${column.internal}`.as(column.id))
        .where("id", "=", traceId)
        .executeTakeFirstOrThrow();

      mappingResult.push({
        var: variable,
        value: trace[mapping.selectedColumnId],
      });
    }
    if (["generation", "span", "event"].includes(mapping.langfuseObject)) {
      const column = observationsTableCols.find(
        (col) => col.id === mapping.selectedColumnId
      );

      if (!mapping.objectName) {
        console.log(
          `No object name found for variable ${variable} and object ${mapping.langfuseObject}`
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      if (!column?.id) {
        console.log(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      const observation = await kyselyPrisma.$kysely
        .selectFrom("observations as o")
        .select(sql<string>`${column.internal}`.as(column.id))
        .where("trace_id", "=", traceId)
        .where("name", "=", mapping.objectName)
        .executeTakeFirstOrThrow();

      mappingResult.push({
        var: variable,
        value: observation[mapping.selectedColumnId],
      });
    }
  }
  return mappingResult;
}
