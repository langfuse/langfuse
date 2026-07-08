BEGIN;

ALTER TABLE "observations"
RENAME COLUMN "prompt" TO "input";

ALTER TABLE "observations"
ADD COLUMN "output_temp" JSONB;

UPDATE "observations"
SET "output_temp" = json_build_object('completion', "observations"."completion");

ALTER TABLE "observations"
DROP COLUMN "completion";

ALTER TABLE "observations"
RENAME COLUMN "output_temp" TO "output";

COMMIT;