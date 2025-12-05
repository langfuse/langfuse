BEGIN;

-- 1. Add columns 
ALTER TABLE "dataset_items" 
    ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sys_id" TEXT, 
    ADD COLUMN "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "status" DROP NOT NULL;

-- 2. Set default for NEW rows
ALTER TABLE "dataset_items" 
    ALTER COLUMN "sys_id" SET DEFAULT md5(random()::text || clock_timestamp()::text)::uuid::text;

COMMIT;