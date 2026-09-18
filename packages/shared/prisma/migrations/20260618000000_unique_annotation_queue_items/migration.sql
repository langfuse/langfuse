-- Pre-flight check for the upcoming unique index on annotation_queue_items.
-- See langfuse/langfuse#12938.
--
-- This migration deliberately does NOT delete existing duplicate rows. If the
-- table has duplicates, the DO block below aborts the migration with a clear
-- error so the operator can review and dedupe explicitly before re-running.
-- Cleanup SQL is documented in the PR description so operators can pick their
-- own survivor rule (newest, oldest, or based on attached lock/annotator/
-- status state) and back up first.
--
-- The actual CREATE UNIQUE INDEX is in the next migration so it can use
-- CONCURRENTLY without taking a ShareLock on annotation_queue_items during
-- index creation. Splitting the file mirrors prior Langfuse precedents
-- (see 20240513082204_scores_unique_id_and_projectid_instead_of_id_and_traceid_index
-- and 20251210133946_dataset_items_create_idx_id_project_id_valid_from).
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT COUNT(*) INTO dup_groups FROM (
    SELECT 1
    FROM annotation_queue_items
    GROUP BY project_id, queue_id, object_id, object_type
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot create unique index on annotation_queue_items: % duplicate (project_id, queue_id, object_id, object_type) group(s) exist. '
      'Review duplicates and dedupe explicitly before re-running migrations. See langfuse/langfuse#12938 for the inspect/cleanup queries.',
      dup_groups;
  END IF;
END $$;
