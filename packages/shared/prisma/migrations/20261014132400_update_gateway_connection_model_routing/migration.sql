DROP INDEX "gateway_ai_connections_organization_id_routing_priority_key";

DROP INDEX "gateway_ai_connections_organization_id_status_routing_prior_idx";

ALTER TABLE "gateway_ai_connections"
ADD COLUMN "allowed_models" JSONB,
DROP COLUMN "routing_priority";

CREATE INDEX "gateway_ai_conn_org_created_at_id_idx"
ON "gateway_ai_connections"("organization_id", "created_at", "id");

CREATE INDEX "gateway_ai_conn_org_status_created_at_id_idx"
ON "gateway_ai_connections"("organization_id", "status", "created_at", "id");
