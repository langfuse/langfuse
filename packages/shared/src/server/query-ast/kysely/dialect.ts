import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  type Dialect,
} from "kysely";

import { ClickHouseQueryCompiler } from "./compiler";
import type { ClickHouseDatabase } from "./schema";

/**
 * Compile-only ClickHouse dialect. Queries are never executed through Kysely;
 * the existing `queryClickhouse` seam remains the exec path. DummyDriver
 * throws if anyone tries to `.execute()`.
 */
export class ClickHouseCompileDialect implements Dialect {
  createDriver() {
    return new DummyDriver();
  }

  createQueryCompiler() {
    return new ClickHouseQueryCompiler();
  }

  createAdapter() {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }
}

let compileDb: Kysely<ClickHouseDatabase> | undefined;

export function getClickhouseKysely(): Kysely<ClickHouseDatabase> {
  compileDb ??= new Kysely<ClickHouseDatabase>({
    dialect: new ClickHouseCompileDialect(),
  });
  return compileDb;
}
