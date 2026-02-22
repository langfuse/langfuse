DO $$
DECLARE
 target_migration_name CONSTANT TEXT := '20260203220622_pending_deletions_object_id_idx';
 target_migration_checksum CONSTANT TEXT := 'cbbaac5ed963d02d4e639fb98ae8c4b9496de63a5d97c1dbf3739e465ded2131';
 has_applied_migration BOOLEAN := FALSE;
 has_unfinished_migration BOOLEAN := FALSE;
BEGIN
 IF EXISTS (
   SELECT 1
   FROM information_schema.tables
   WHERE table_schema = current_schema()
     AND table_name = '_prisma_migrations'
 ) THEN
  DELETE FROM _prisma_migrations
  WHERE migration_name IN ('20240606090858_pricings_add_latest_gemini_models', '20240530212419_model_price_anthropic_via_google_vertex', '20240604133340_backfill_manual_scores');
 END IF;

 IF current_schema() <> 'public'
   AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '_prisma_migrations')
   AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'pending_deletions')
 THEN
  SELECT EXISTS (
    SELECT 1
    FROM _prisma_migrations
    WHERE migration_name = target_migration_name
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) INTO has_applied_migration;

  IF NOT has_applied_migration THEN
   SELECT EXISTS (
     SELECT 1
     FROM _prisma_migrations
     WHERE migration_name = target_migration_name
       AND finished_at IS NULL
       AND rolled_back_at IS NULL
   ) INTO has_unfinished_migration;

   DROP INDEX IF EXISTS "pending_deletions_project_id_object_is_deleted_idx";
   CREATE INDEX IF NOT EXISTS "pending_deletions_project_id_object_is_deleted_object_id_id_idx"
     ON "pending_deletions"("project_id", "object", "is_deleted", "object_id", "id");

   IF has_unfinished_migration THEN
    UPDATE _prisma_migrations
    SET finished_at = NOW(),
        logs = NULL,
        rolled_back_at = NULL,
        applied_steps_count = GREATEST(applied_steps_count, 1)
    WHERE migration_name = target_migration_name
      AND finished_at IS NULL
      AND rolled_back_at IS NULL;
   ELSE
    INSERT INTO _prisma_migrations (
      id,
      checksum,
      finished_at,
      migration_name,
      logs,
      rolled_back_at,
      started_at,
      applied_steps_count
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text),
      target_migration_checksum,
      NOW(),
      target_migration_name,
      NULL,
      NULL,
      NOW(),
      1
    );
   END IF;
  END IF;
 END IF;
END $$;
