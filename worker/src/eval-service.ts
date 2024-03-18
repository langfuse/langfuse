import { z } from "zod";

import { EvalEvent } from "shared/src/queues/index";
import { db } from "./database";
// import { singleFilter } from "shared/src/interfaces/filters";
import { tableColumnsToSqlFilter } from "shared/src/filterToPrisma";
import { tracesTableCols } from "shared/src/interfaces/tracesTable";
import { sql } from "kysely";
import { Trace } from "../generated/types";

export const createEvalJobs = async ({
  event,
}: {
  event: z.infer<typeof EvalEvent>;
}) => {
  const a = EvalEvent.parse(event);
  const configurations = await db
    .selectFrom("job_configurations")
    .selectAll()
    .where("job_type", "=", "Evaluation")
    .where("project_id", "=", event.data.projectId)
    .execute();

  for (const configuration of configurations) {
    // const parsedFilers = z.array(singleFilter).parse(configuration.filter);
    // const filters = tableColumnsToSqlFilter(
    //   parsedFilers,
    //   tracesTableCols,
    //   "traces"
    // );
    // const trace = sql<Trace[]>`
    //   select *
    //   from traces
    //   where id = ${event.data.traceId}
    //   ${filters}
    // `.execute(db);
    // console.log(trace);
    // const traceQuery = db
    //   .selectFrom("traces")
    //   .selectAll()
    //   .where(({ eb, or, and, not, exists, selectFrom }) =>
    //     and([
    //       sql<string>`${filters}`,
    //       eb("project_id", "=", event.data.projectId),
    //       eb("id", "=", event.data.traceId),
    //     ])
    //   );
    // .where()
    // .executeTakeFirst();
    // console.log(trace);
  }

  // const trace = await db
  //   .selectFrom("traces")
  //   .selectAll()
  //   .where("id", "=", data.data.traceId)
  //   .where("project_id", "=", data.data.projectId)
  //   .where("project_id", "=", data.data.projectId)
  //   .executeTakeFirst();
};
