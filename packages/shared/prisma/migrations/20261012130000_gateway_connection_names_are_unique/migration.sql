-- Connection names are model-routing slugs. Normalize legacy separators and
-- disambiguate duplicate names before enforcing the routing invariant.
UPDATE "gateway_ai_connections"
SET "name" = replace("name", '/', '-')
WHERE "name" LIKE '%/%';

WITH ranked_connections AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "organization_id", "name"
      ORDER BY "routing_priority", "id"
    ) AS duplicate_number
  FROM "gateway_ai_connections"
)
UPDATE "gateway_ai_connections" AS connection
SET "name" = left(connection."name", 160) || ' (' || connection."id" || ')'
FROM ranked_connections
WHERE connection."id" = ranked_connections."id"
  AND ranked_connections.duplicate_number > 1;

CREATE UNIQUE INDEX "gateway_ai_connections_organization_id_name_key"
ON "gateway_ai_connections"("organization_id", "name");
