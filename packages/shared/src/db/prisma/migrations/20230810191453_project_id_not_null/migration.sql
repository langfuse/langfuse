-- Applied in separate migration after application release to minimize ingestion downtime
ALTER TABLE "observations"
ALTER COLUMN "project_id" SET NOT NULL;
