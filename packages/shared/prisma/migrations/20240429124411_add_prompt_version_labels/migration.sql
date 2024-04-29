BEGIN;

-- Step 1: Alter the 'prompts' table to add the 'labels' column
ALTER TABLE prompts
ADD COLUMN labels TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Step 2: Update the 'labels' column to include 'production' for active prompts
UPDATE prompts
SET labels = array_append(labels, 'production')
WHERE is_active = TRUE;

-- Step 3: Drop the required constraint on 'is_active' column.
ALTER TABLE prompts
ALTER COLUMN is_active DROP NOT NULL;

COMMIT;