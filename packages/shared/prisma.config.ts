import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
let databaseSchema = "public";
if (databaseUrl) {
  try {
    databaseSchema =
      new URL(databaseUrl).searchParams.get("schema") || "public";
  } catch {
    throw new Error(
      "DIRECT_URL or DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "dotenv -e ../../.env -- tsx scripts/seeder/seed-postgres.ts",
  },
  experimental: { externalTables: true },
  tables: {
    // Topics models stay available to Prisma Client; their DDL is applied by
    // scripts/topics-dev-tables.ts outside the migration history.
    external: [
      "facets",
      "facet_versions",
      "facet_rules",
      "facet_rule_assignments",
      "topic_clustering_runs",
    ].map((table) => `${databaseSchema}.${table}`),
  },
});
