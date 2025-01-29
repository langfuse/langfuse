BEGIN;

  ALTER TABLE "llm_api_keys" 
    ADD COLUMN "base_url" TEXT,
    ADD COLUMN "adapter" TEXT,
    ADD COLUMN "custom_models" TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    ADD COLUMN "with_default_models" BOOLEAN NOT NULL DEFAULT true;

  UPDATE "llm_api_keys"
    SET "adapter" = "provider";

  ALTER TABLE "llm_api_keys" 
    ALTER COLUMN "adapter" SET NOT NULL;

  ALTER TABLE "eval_templates"
    ADD COLUMN "provider" TEXT;
  
  UPDATE "eval_templates"
    SET "provider" = 'openai';
  
  ALTER TABLE "eval_templates"
    ALTER COLUMN "provider" SET NOT NULL;

COMMIT;