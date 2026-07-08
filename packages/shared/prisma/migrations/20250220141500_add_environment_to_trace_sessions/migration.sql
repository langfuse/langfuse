-- AlterTable
ALTER TABLE "trace_sessions"
ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'default';
