import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { DB } from "@langfuse/shared";
import { env } from "./env";

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: env.DATABASE_URL,
    }),
  }),
});
