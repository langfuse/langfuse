-- The event_log table was superseded by blob_storage_file_log. Its contents
-- were copied over by the 20250417_1737_migrate_event_log_to_blob_storage
-- background migration, which must have completed (on the latest v3 release)
-- before upgrading to v4.
DROP TABLE IF EXISTS event_log ON CLUSTER default;
