BEGIN;

-- 1. Add columns 
ALTER TABLE "dataset_items" 
    ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sys_id" TEXT, 
    ADD COLUMN "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER COLUMN "status" DROP NOT NULL;

-- 2. Set default for NEW rows
ALTER TABLE "dataset_items" 
    ALTER COLUMN "sys_id" SET DEFAULT md5(random()::text || clock_timestamp()::text)::uuid::text;

COMMIT;

-- Second migration to do: 

BEGIN;

-- Step 1: Backfill existing rows
UPDATE "dataset_items"
SET "sys_id" = md5(random()::text || clock_timestamp()::text || id::text || project_id::text)::uuid::text
WHERE "sys_id" IS NULL;

-- Step 2: Make column NOT NULL
ALTER TABLE "dataset_items" 
ALTER COLUMN "sys_id" SET NOT NULL;

-- Step 3: Add UNIQUE constraint on new PK columns for Phase 1 of PK swap
ALTER TABLE "dataset_items"
ADD CONSTRAINT "dataset_items_sys_id_project_id_key" UNIQUE ("sys_id", "project_id");

COMMIT;