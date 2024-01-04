-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_model_idx" ON "observations"("model");

-- CreateIndex
CREATE INDEX CONCURRENTLY "pricings_model_name_idx" ON "pricings"("model_name");
