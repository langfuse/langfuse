CREATE TABLE IF NOT EXISTS "gateway_spend_limit_resets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "spend_limit_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "user_id" TEXT,
    "counting_started_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_spend_limit_resets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_spend_limit_resets_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limit_resets_spend_limit_id_fkey"
        FOREIGN KEY ("spend_limit_id") REFERENCES "gateway_spend_limits"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limit_resets_api_key_id_fkey"
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limit_resets_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limit_resets_subject_check"
        CHECK (("api_key_id" IS NOT NULL) <> ("user_id" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limit_resets_spend_limit_id_api_key_id_key"
    ON "gateway_spend_limit_resets"("spend_limit_id", "api_key_id");

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limit_resets_spend_limit_id_user_id_key"
    ON "gateway_spend_limit_resets"("spend_limit_id", "user_id");

CREATE INDEX IF NOT EXISTS "gateway_spend_limit_resets_organization_id_idx"
    ON "gateway_spend_limit_resets"("organization_id");

CREATE INDEX IF NOT EXISTS "gateway_spend_limit_resets_api_key_id_idx"
    ON "gateway_spend_limit_resets"("api_key_id");

CREATE INDEX IF NOT EXISTS "gateway_spend_limit_resets_user_id_idx"
    ON "gateway_spend_limit_resets"("user_id");
