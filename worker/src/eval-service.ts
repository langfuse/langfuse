import { z } from "zod";
import { EvalBody } from "./redis-consumer";
import { db } from "./database";

export const evaluate = async ({
  data,
}: {
  data: z.infer<typeof EvalBody>;
}) => {
  const trace = await db
    .selectFrom("traces")
    .selectAll()
    .where("id", "=", data.traceId)
    .where("project_id", "=", data.projectId)
    .where("project_id", "=", data.projectId)
    .executeTakeFirst();

  console.log(trace);
};
