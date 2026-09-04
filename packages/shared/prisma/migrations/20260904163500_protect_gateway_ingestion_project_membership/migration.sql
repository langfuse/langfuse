CREATE OR REPLACE FUNCTION protect_gateway_ingestion_project_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "project_memberships" (
    "project_id",
    "user_id",
    "org_membership_id",
    "role",
    "created_at",
    "updated_at"
  )
  SELECT
    config."default_ingestion_project_id",
    NEW."user_id",
    NEW."id",
    'NONE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "gateway_configs" AS config
  WHERE config."organization_id" = NEW."org_id"
    AND config."default_ingestion_project_id" IS NOT NULL
  ON CONFLICT ("project_id", "user_id") DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'protect_gateway_ingestion_project_membership'
  ) THEN
    CREATE TRIGGER protect_gateway_ingestion_project_membership
    AFTER INSERT ON "organization_memberships"
    FOR EACH ROW
    EXECUTE FUNCTION protect_gateway_ingestion_project_membership();
  END IF;
END
$$;
