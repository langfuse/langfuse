-- CreateTable
CREATE TABLE "eval_run_scope_assignments" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_configuration_id" TEXT NOT NULL,
    "run_scope_id" TEXT NOT NULL,

    CONSTRAINT "eval_run_scope_assignments_pkey" PRIMARY KEY ("job_configuration_id","run_scope_id")
);

-- Backfill the existing one-to-many links before removing the legacy column.
INSERT INTO "eval_run_scope_assignments" ("job_configuration_id", "run_scope_id")
SELECT "id", "run_scope_id"
FROM "job_configurations"
WHERE "run_scope_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "eval_run_scope_assignments_run_scope_id_idx" ON "eval_run_scope_assignments"("run_scope_id");

-- AddForeignKey
ALTER TABLE "eval_run_scope_assignments" ADD CONSTRAINT "eval_run_scope_assignments_job_configuration_id_fkey" FOREIGN KEY ("job_configuration_id") REFERENCES "job_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_run_scope_assignments" ADD CONSTRAINT "eval_run_scope_assignments_run_scope_id_fkey" FOREIGN KEY ("run_scope_id") REFERENCES "eval_run_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "job_configurations" DROP CONSTRAINT "job_configurations_run_scope_id_fkey";

-- AlterTable
ALTER TABLE "job_configurations" DROP COLUMN "run_scope_id";
