-- CreateIndex
CREATE INDEX CONCURRENTLY "scores_annotation_config_id_idx" ON "scores" USING HASH ("annotation_config_id");
