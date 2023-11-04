-- CreateIndex
CREATE INDEX "scores_trace_id_idx" ON "scores" USING HASH ("trace_id");

-- CreateIndex
CREATE INDEX "scores_observation_id_idx" ON "scores" USING HASH ("observation_id");
