-- Keys bound to a user were stored as organization keys before the USER scope existed.
UPDATE "api_keys"
SET "scope" = 'USER'
WHERE "user_id" IS NOT NULL
  AND "scope" = 'ORGANIZATION';
