-- CreateEnum
CREATE TYPE "InAppAgentSandboxProvider" AS ENUM ('dangerous-docker', 'lambda-microvm');

-- AlterTable
ALTER TABLE "in_app_agent_conversations" ADD COLUMN     "sandbox_expires_at" TIMESTAMP(3),
ADD COLUMN     "sandbox_provider" "InAppAgentSandboxProvider";
