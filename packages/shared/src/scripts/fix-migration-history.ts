// Description: Deletes a migration which added a model to the models table. Accidentially, we specified the schema in this file.
// Self-hosters running on different schemas than public ran into errors with this migration.
// As this migration does not introduce any model changes, we can just remove it.
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
  const tabelExists: { table_schema: string; table_name: string }[] =
    await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT * FROM information_schema.tables 
      WHERE    table_name   = '_prisma_migrations';`;
  console.log(tabelExists);

  if (tabelExists.length > 0) {
    // update checksum
    await prisma.$executeRaw`
    DELETE FROM _prisma_migrations WHERE migration_name in ('20240606090858_pricings_add_latest_gemini_models', '20240530212419_model_price_anthropic_via_google_vertex', '20240604133340_backfill_manual_scores');`;
  }
}
