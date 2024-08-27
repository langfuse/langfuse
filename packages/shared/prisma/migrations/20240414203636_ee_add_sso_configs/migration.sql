-- CreateTable
CREATE TABLE "sso_configs" (
    "domain" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auth_provider" TEXT NOT NULL,
    "auth_config" JSONB,

    CONSTRAINT "sso_configs_pkey" PRIMARY KEY ("domain")
);
