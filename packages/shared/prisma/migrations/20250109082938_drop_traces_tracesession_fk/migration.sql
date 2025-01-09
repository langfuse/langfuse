-- DropForeignKey
ALTER TABLE "traces" DROP CONSTRAINT "traces_session_id_project_id_fkey";

-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "traceSessionId" TEXT,
ADD COLUMN     "traceSessionProjectId" TEXT;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_traceSessionId_traceSessionProjectId_fkey" FOREIGN KEY ("traceSessionId", "traceSessionProjectId") REFERENCES "trace_sessions"("id", "project_id") ON DELETE SET NULL ON UPDATE CASCADE;
