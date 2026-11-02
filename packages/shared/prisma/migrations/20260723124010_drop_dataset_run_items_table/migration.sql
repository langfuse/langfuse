-- The legacy dataset_run_items table is superseded by the ClickHouse
-- dataset_run_items_rmt table. Its contents were copied over by the
-- 20250814_1001_migrate_dataset_run_items_rmt_pg_to_ch background migration,
-- which must have completed (on the latest v3 release) before upgrading to v4.
DROP TABLE IF EXISTS "dataset_run_items";

-- Remove the background migrations whose source tables are dropped in v4
-- (dataset_run_items here, event_log in ClickHouse migration 0044). Their
-- worker scripts are deleted alongside this migration, so leftover unfinished
-- rows would make the BackgroundMigrationManager fail to resolve the script.
DELETE FROM "background_migrations"
WHERE "name" IN (
  '20250417_1737_migrate_event_log_to_blob_storage',
  '20250731_1001_migrate_dataset_run_items_pg_to_ch',
  '20250814_1001_migrate_dataset_run_items_rmt_pg_to_ch'
);
