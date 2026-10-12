BEGIN;

LOCK TABLE gateway_ai_connections IN SHARE ROW EXCLUSIVE MODE;

-- The model slug uses the first colon as its connection-name separator.
UPDATE gateway_ai_connections
SET name = replace(name, ':', '-')
WHERE name LIKE '%:%';

-- Keep the oldest connection's name stable and make later duplicates explicit.
-- The loop also avoids collisions with existing names that already contain an
-- id-shaped suffix.
DO $$
DECLARE
  duplicate_connection record;
  candidate_name text;
  suffix integer;
BEGIN
  FOR duplicate_connection IN
    SELECT id, organization_id, name
    FROM (
      SELECT
        id,
        organization_id,
        name,
        row_number() OVER (
          PARTITION BY organization_id, name
          ORDER BY created_at, id
        ) AS duplicate_number
      FROM gateway_ai_connections
    ) AS ranked_connections
    WHERE duplicate_number > 1
  LOOP
    candidate_name := duplicate_connection.name || '-' || duplicate_connection.id;
    suffix := 1;

    WHILE EXISTS (
      SELECT 1
      FROM gateway_ai_connections
      WHERE organization_id = duplicate_connection.organization_id
        AND name = candidate_name
        AND id <> duplicate_connection.id
    )
    LOOP
      candidate_name :=
        duplicate_connection.name || '-' || duplicate_connection.id || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE gateway_ai_connections
    SET name = candidate_name
    WHERE id = duplicate_connection.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX gateway_ai_connections_organization_id_name_key
ON gateway_ai_connections(organization_id, name);

ALTER TABLE gateway_ai_connections
ADD CONSTRAINT gateway_ai_connections_name_without_colon
CHECK (position(':' in name) = 0);

COMMIT;
