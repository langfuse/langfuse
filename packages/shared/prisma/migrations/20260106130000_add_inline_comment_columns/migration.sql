-- Add inline comment positioning columns to comments table
-- These columns enable character-based inline comments on trace/observation IO

-- data_field: which IO field the comment is on ('input' | 'output' | 'metadata')
ALTER TABLE "comments" ADD COLUMN "data_field" TEXT;

-- path: JSON Path expressions array, e.g., ["$.messages[1].text"]
ALTER TABLE "comments" ADD COLUMN "path" TEXT[] DEFAULT '{}';

-- range_start: start offsets per path (inclusive), UTF-16 code units
ALTER TABLE "comments" ADD COLUMN "range_start" INTEGER[] DEFAULT '{}';

-- range_end: end offsets per path (exclusive), UTF-16 code units
ALTER TABLE "comments" ADD COLUMN "range_end" INTEGER[] DEFAULT '{}';
