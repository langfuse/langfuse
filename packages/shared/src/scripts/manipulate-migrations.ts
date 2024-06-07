// Description: Deletes a migration which added a model to the models table. Accidentially, we specified the schema in this file.
// Self-hosters running on different schemas than public ran into errors with this migration.
// As this migration does not introduce any model changes, we can just remove it.
// Issue: https://github.com/langfuse/langfuse/issues/2266

// test cases to consider:
// - user applied faulty migration on public, everything worked -> removal of migration file and row, will be added back.
// - user did not apply faulty migration on public -> no impact, row not applied yet in db.
// - user applied faulty migration on non public, ran into error -> we remove migration file and db entry before migration, will get the updated migration which patches the error in models no matter how the migration was manually fixed.
// - user did not apply faulty migration on non public, about to run into error -> we removed faulty migration, will only get updated migration.

import "dotenv/config";

import { prisma } from "@langfuse/shared/src/db";

async function main() {
  return await manipulateMigrations();
}

// Call the function
main().catch((err) => {
  console.error("An error occurred:", err);
});

export async function manipulateMigrations() {
  const tableExists: { table_schema: string; table_name: string }[] =
    await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT * FROM information_schema.tables 
      WHERE    table_name   = '_prisma_migrations';`;

  console.log(tableExists);

  if (tableExists.length > 0) {
    // update checksum
    await prisma.$executeRaw`
    DELETE FROM _prisma_migrations WHERE migration_name in ('20240606090858_pricings_add_latest_gemini_models', '20240530212419_model_price_anthropic_via_google_vertex');`;
  }
}
