-- CreateTable
CREATE TABLE "dataset_item_events" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "status" "DatasetStatus",
    "input" JSONB,
    "expected_output" JSONB,
    "metadata" JSONB,
    "source_trace_id" TEXT,
    "source_observation_id" TEXT,
    "created_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dataset_item_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dataset_item_events" ADD CONSTRAINT "dataset_item_events_dataset_id_project_id_fkey" FOREIGN KEY ("dataset_id", "project_id") REFERENCES "datasets"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
