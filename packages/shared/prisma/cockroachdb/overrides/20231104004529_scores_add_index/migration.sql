-- CockroachDB has no HASH index access method; these are B-tree indexes.

-- CreateIndex
CREATE INDEX "scores_trace_id_idx" ON "scores"("trace_id");

-- CreateIndex
CREATE INDEX "scores_observation_id_idx" ON "scores"("observation_id");
