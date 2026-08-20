-- The dataset_run_items table was superseded by dataset_run_items_rmt
-- (created in 0024). All ingestion writes, reads and deletes target the
-- _rmt table, so this table has been frozen since the cutover.
DROP TABLE IF EXISTS dataset_run_items;
