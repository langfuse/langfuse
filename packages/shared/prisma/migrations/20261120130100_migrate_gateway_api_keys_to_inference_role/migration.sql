-- Move existing gateway API keys from AI_GATEWAY (and any pre-role-assignment
-- associated gateway keys still holding LEGACY_ORGANIZATION_API_KEY) to
-- AI_GATEWAY_INFERENCE, leaving user memberships and non-gateway API keys intact.
BEGIN;

-- Migrate API keys currently holding the AI_GATEWAY role (including both
-- associated gateway keys and any org API keys issued with AI_GATEWAY).
DELETE FROM "role_assignments" ra
WHERE ra."api_key_id" IS NOT NULL
  AND ra."system_role" = 'AI_GATEWAY'::"SystemRole"
  AND EXISTS (
    SELECT 1
    FROM "role_assignments" existing
    WHERE existing."owner_id" = ra."owner_id"
      AND existing."principal_id" = ra."principal_id"
      AND existing."system_role" = 'AI_GATEWAY_INFERENCE'::"SystemRole"
  );

UPDATE "role_assignments" ra
SET "system_role" = 'AI_GATEWAY_INFERENCE'::"SystemRole",
    "role_id" = 'system/AI_GATEWAY_INFERENCE',
    "updated_at" = now()
WHERE ra."api_key_id" IS NOT NULL
  AND ra."system_role" = 'AI_GATEWAY'::"SystemRole";

-- Migrate any pre-role-assignment gateway keys (linked in gateway_api_key_associations)
-- that were backfilled with LEGACY_ORGANIZATION_API_KEY.
DELETE FROM "role_assignments" ra
WHERE ra."api_key_id" IS NOT NULL
  AND ra."system_role" = 'LEGACY_ORGANIZATION_API_KEY'::"SystemRole"
  AND EXISTS (
    SELECT 1
    FROM "gateway_api_key_associations" g
    WHERE g."api_key_id" = ra."api_key_id"
  )
  AND EXISTS (
    SELECT 1
    FROM "role_assignments" existing
    WHERE existing."owner_id" = ra."owner_id"
      AND existing."principal_id" = ra."principal_id"
      AND existing."system_role" = 'AI_GATEWAY_INFERENCE'::"SystemRole"
  );

UPDATE "role_assignments" ra
SET "system_role" = 'AI_GATEWAY_INFERENCE'::"SystemRole",
    "role_id" = 'system/AI_GATEWAY_INFERENCE',
    "updated_at" = now()
WHERE ra."api_key_id" IS NOT NULL
  AND ra."system_role" = 'LEGACY_ORGANIZATION_API_KEY'::"SystemRole"
  AND EXISTS (
    SELECT 1
    FROM "gateway_api_key_associations" g
    WHERE g."api_key_id" = ra."api_key_id"
  );

-- Backfill any associated gateway key that has no role assignment yet.
INSERT INTO "role_assignments" (
  "id",
  "org_id",
  "owner_id",
  "principal_id",
  "api_key_id",
  "role_id",
  "system_role",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  ak."organization_id",
  'organization/' || ak."organization_id",
  'apiKey/' || ak."id",
  ak."id",
  'system/AI_GATEWAY_INFERENCE',
  'AI_GATEWAY_INFERENCE'::"SystemRole",
  now(),
  now()
FROM "gateway_api_key_associations" g
JOIN "api_keys" ak ON ak."id" = g."api_key_id"
WHERE ak."organization_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "role_assignments" ra
    WHERE ra."api_key_id" = ak."id"
  )
ON CONFLICT DO NOTHING;

COMMIT;
