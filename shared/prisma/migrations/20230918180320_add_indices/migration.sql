-- CreateIndex
CREATE INDEX "observations_start_time_idx" ON "observations"("start_time");

-- CreateIndex
CREATE INDEX "traces_timestamp_idx" ON "traces"("timestamp");
