-- AlterTable
ALTER TABLE "sso_configs" ALTER COLUMN "auth_config" DROP NOT NULL,
ALTER COLUMN "auth_config" DROP DEFAULT;
