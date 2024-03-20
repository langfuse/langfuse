import { z } from "zod";

import { EvalEvent } from "@langfuse/shared";
import { db } from "./database";

export const evaluate = async ({
  data,
}: {
  data: z.infer<typeof EvalEvent>;
}) => {
  const trace = await db
    .selectFrom("traces")
    .selectAll()
    .where("id", "=", data.data.traceId)
    .where("project_id", "=", data.data.projectId)
    .where("project_id", "=", data.data.projectId)
    .executeTakeFirst();

  console.log(trace);
};
