-- DropIndex
DROP INDEX "observations_trace_id_type_idx";

-- DropIndex
DROP INDEX "traces_project_id_name_user_id_external_id_idx";

-- CreateIndex
CREATE INDEX "observations_trace_id_idx" ON "observations"("trace_id");

-- CreateIndex
CREATE INDEX "observations_type_idx" ON "observations"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "traces_project_id_idx" ON "traces"("project_id");

-- CreateIndex
CREATE INDEX  "traces_name_idx" ON "traces"("name");

-- CreateIndex
CREATE INDEX "traces_user_id_idx" ON "traces"("user_id");

-- CreateIndex
CREATE INDEX "traces_external_id_idx" ON "traces"("external_id");
