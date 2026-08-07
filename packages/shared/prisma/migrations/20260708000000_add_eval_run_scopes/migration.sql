-- CreateTable
CREATE TABLE "eval_run_scopes" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_object" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "sampling" DECIMAL(65,30) NOT NULL,
    "delay" INTEGER NOT NULL DEFAULT 30000,
    "time_scope" TEXT[] DEFAULT ARRAY['NEW']::TEXT[],

    CONSTRAINT "eval_run_scopes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN "run_scope_id" TEXT;

-- CreateIndex
CREATE INDEX "eval_run_scopes_project_id_idx" ON "eval_run_scopes"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "eval_run_scopes_project_id_name_key" ON "eval_run_scopes"("project_id", "name");

-- AddForeignKey
ALTER TABLE "eval_run_scopes" ADD CONSTRAINT "eval_run_scopes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_run_scope_id_fkey" FOREIGN KEY ("run_scope_id") REFERENCES "eval_run_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
