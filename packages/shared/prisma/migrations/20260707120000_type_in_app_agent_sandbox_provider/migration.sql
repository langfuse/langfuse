CREATE TYPE "InAppAgentSandboxProvider" AS ENUM ('dangerous-docker', 'lambda-microvm');

ALTER TABLE "in_app_agent_conversations"
ALTER COLUMN "sandbox_provider" TYPE "InAppAgentSandboxProvider"
USING ("sandbox_provider"::"InAppAgentSandboxProvider");
