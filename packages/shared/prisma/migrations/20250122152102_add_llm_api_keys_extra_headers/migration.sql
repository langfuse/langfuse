ALTER TABLE "llm_api_keys"
    ADD COLUMN "extra_headers" TEXT,
    ADD COLUMN "extra_header_keys" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
