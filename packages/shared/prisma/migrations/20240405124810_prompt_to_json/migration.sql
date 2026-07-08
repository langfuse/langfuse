BEGIN;

ALTER TABLE prompts
ADD COLUMN json_prompt JSONB;

UPDATE prompts
SET json_prompt = to_json(prompt::text)::json;

ALTER TABLE prompts
DROP COLUMN prompt;

ALTER TABLE prompts
RENAME COLUMN json_prompt TO prompt;

ALTER TABLE prompts
ALTER COLUMN prompt SET NOT NULL;

ALTER TABLE prompts
ADD COLUMN type TEXT NOT NULL DEFAULT 'text';

COMMIT;
