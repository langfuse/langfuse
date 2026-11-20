-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "models_organization_id_model_name_key" ON "models"("organization_id", "model_name") WHERE "organization_id" IS NOT NULL;
