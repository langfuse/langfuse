-- Persisted start_time of the referenced observation so by-id lookups can bound
-- the events_full scan by partition/part instead of scanning the whole table.
-- Nullable: older rows and non-observation items have no value.
ALTER TABLE "annotation_queue_items" ADD COLUMN "object_start_time" TIMESTAMP(3);
