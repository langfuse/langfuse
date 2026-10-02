import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "dotenv -e ../../.env -- tsx scripts/seeder/seed-postgres.ts",
  },
});
