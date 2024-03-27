import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "./env";
import { DB } from "@langfuse/shared/db/types/kysely";

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: env.DATABASE_URL,
    }),
  }),
});
