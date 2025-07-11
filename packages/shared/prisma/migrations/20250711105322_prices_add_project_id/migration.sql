-- AlterTable
ALTER TABLE "prices"
    ADD COLUMN "project_id" TEXT;

-- AddForeignKey
ALTER TABLE "prices"
    ADD CONSTRAINT "prices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BackfillData
UPDATE "prices"
SET "project_id" = (SELECT "models"."project_id"
                    FROM "models"
                    WHERE "models"."id" = "prices"."model_id");
