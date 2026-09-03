ALTER TABLE "evaluator_versions"
ADD COLUMN IF NOT EXISTS "prompt_messages" JSONB;
