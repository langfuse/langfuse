-- DropIndex
DROP INDEX "traces_project_id_idx";

-- CreateIndex
CREATE INDEX "observations_trace_id_type_idx" ON "observations"("trace_id", "type");

-- CreateIndex
CREATE INDEX "scores_value_idx" ON "scores"("value");

-- CreateIndex
CREATE INDEX "traces_project_id_name_idx" ON "traces"("project_id", "name");
