-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "client_ip" TEXT,
ADD COLUMN     "ip_chain" TEXT[];
