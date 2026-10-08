-- Delete duplicate annotation queue memberships, keeping the oldest item.
WITH ranked_items AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, queue_id, object_id, object_type
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM annotation_queue_items
)
DELETE FROM annotation_queue_items
WHERE id IN (
  SELECT id FROM ranked_items WHERE rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "annotation_queue_items_project_queue_object_unique"
ON "annotation_queue_items"("project_id", "queue_id", "object_id", "object_type");
