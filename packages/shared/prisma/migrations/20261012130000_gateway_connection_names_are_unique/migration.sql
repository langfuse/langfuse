-- Connection names are model-routing slugs. Normalize legacy separators and
-- disambiguate duplicate names before enforcing the routing invariant.
UPDATE "gateway_ai_connections"
SET "name" = replace("name", '/', '-')
WHERE "name" LIKE '%/%';

DO $$
DECLARE
  duplicate RECORD;
  candidate TEXT;
  attempt INTEGER;
BEGIN
  FOR duplicate IN
    SELECT "id", "organization_id", "name"
    FROM (
      SELECT
        "id",
        "organization_id",
        "name",
        row_number() OVER (
          PARTITION BY "organization_id", "name"
          ORDER BY "routing_priority", "id"
        ) AS duplicate_number
      FROM "gateway_ai_connections"
    ) AS ranked_connections
    WHERE duplicate_number > 1
  LOOP
    attempt := 0;
    LOOP
      candidate := left(duplicate."name", 150)
        || ' (' || duplicate."id"
        || CASE WHEN attempt = 0 THEN '' ELSE '-' || attempt::text END
        || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "gateway_ai_connections"
        WHERE "organization_id" = duplicate."organization_id"
          AND "id" <> duplicate."id"
          AND "name" = candidate
      );
      attempt := attempt + 1;
    END LOOP;

    UPDATE "gateway_ai_connections"
    SET "name" = candidate
    WHERE "id" = duplicate."id";
  END LOOP;
END $$;

CREATE UNIQUE INDEX "gateway_ai_connections_organization_id_name_key"
ON "gateway_ai_connections"("organization_id", "name");
