ALTER TABLE "in_app_agent_conversations"
ADD COLUMN "sandbox_snapshot_key" TEXT,
ADD COLUMN "sandbox_expires_at" TIMESTAMP(3),
ADD COLUMN "sandbox_provider" TEXT;
