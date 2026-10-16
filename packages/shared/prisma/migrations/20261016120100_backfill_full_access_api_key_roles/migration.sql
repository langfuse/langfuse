UPDATE "role_assignments"
SET "system_role" = 'FULL_ACCESS',
    "role_id" = 'system/FULL_ACCESS',
    "updated_at" = now()
WHERE "api_key_id" IS NOT NULL
  AND "system_role" = 'ADMIN';
