-- AlterTable
ALTER TABLE "in_app_agent_conversations" ADD COLUMN     "always_allowed_tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
