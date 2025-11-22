-- CreateTable
CREATE TABLE "dataset_item_events" (
    "pk" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "status" "DatasetStatus" NOT NULL DEFAULT 'ACTIVE',
    "input" JSONB,
    "expected_output" JSONB,
    "metadata" JSONB,
    "source_trace_id" TEXT,
    "source_observation_id" TEXT,
    "created_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dataset_item_events_pkey" PRIMARY KEY ("pk")
);

-- AddForeignKey
ALTER TABLE "dataset_item_events" ADD CONSTRAINT "dataset_item_events_dataset_id_project_id_fkey" FOREIGN KEY ("dataset_id", "project_id") REFERENCES "datasets"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
