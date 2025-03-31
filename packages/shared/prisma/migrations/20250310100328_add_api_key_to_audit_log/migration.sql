-- CreateEnum
CREATE TYPE "AuditLogRecordType" AS ENUM ('USER', 'API_KEY');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "api_key_id" TEXT,
ADD COLUMN     "type" "AuditLogRecordType" NOT NULL DEFAULT 'USER',
ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "user_org_role" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "audit_logs_api_key_id_idx" ON "audit_logs"("api_key_id");
