-- AlterTable
ALTER TABLE "observations" ADD COLUMN "unit" TEXT;

DO $$
DECLARE
    batch_size INT := 1000; -- Adjust batch size as needed
    updated_rows INT;
    row_ids TEXT[]; -- Corrected array type declaration
BEGIN
    LOOP
        
        -- Select a batch of row IDs
        SELECT array_agg(id)
        INTO row_ids
        FROM "observations"
        WHERE "unit" IS NULL
        
        LIMIT batch_size;

        -- Exit the loop if no more rows need updating
        EXIT WHEN array_length(row_ids, 1) IS NULL;

        -- Update the selected rows
        UPDATE "observations"
        SET "unit" = 'TOKENS'
        WHERE id = ANY(row_ids);
    END LOOP;
END $$;


UPDATE "observations" SET "unit" = 'TOKENS' WHERE "unit" IS NULL;

ALTER TABLE "observations" ALTER COLUMN "unit" SET NOT NULL;