/*
  Warnings:

  - The primary key for the `trace_sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "traces" DROP CONSTRAINT "traces_session_id_fkey";

-- DropIndex
DROP INDEX "trace_sessions_id_project_id_key";

-- AlterTable
ALTER TABLE "trace_sessions" DROP CONSTRAINT "trace_sessions_pkey",
ADD CONSTRAINT "trace_sessions_pkey" PRIMARY KEY ("id", "project_id");

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_session_id_project_id_fkey" FOREIGN KEY ("session_id", "project_id") REFERENCES "trace_sessions"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
