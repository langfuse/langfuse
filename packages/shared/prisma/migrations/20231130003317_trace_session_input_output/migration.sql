-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "input" JSONB,
ADD COLUMN     "output" JSONB,
ADD COLUMN     "session_id" TEXT;

-- CreateTable
CREATE TABLE "trace_sessions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "trace_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trace_sessions_project_id_idx" ON "trace_sessions"("project_id");

-- CreateIndex
CREATE INDEX "trace_sessions_created_at_idx" ON "trace_sessions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trace_sessions_id_project_id_key" ON "trace_sessions"("id", "project_id");

-- CreateIndex
CREATE INDEX "traces_session_id_idx" ON "traces"("session_id");

-- AddForeignKey
ALTER TABLE "trace_sessions" ADD CONSTRAINT "trace_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trace_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
