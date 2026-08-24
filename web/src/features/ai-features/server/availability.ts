import type { PrismaClient } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";

type LangfuseAiFeatureUnavailableReason =
  | "self-hosted"
  | "project-not-found"
  | "organization-disabled"
  | "model-not-configured";

export type LangfuseAiFeatureAvailability =
  | {
      available: true;
      model: string;
      aiTelemetryEnabled: boolean;
    }
  | {
      available: false;
      reason: LangfuseAiFeatureUnavailableReason;
    };

export async function resolveLangfuseAiFeatureAvailability(params: {
  prisma: PrismaClient;
  projectId: string;
}): Promise<LangfuseAiFeatureAvailability> {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return { available: false, reason: "self-hosted" };
  }

  const project = await params.prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      organization: {
        select: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
      },
    },
  });
  if (!project) return { available: false, reason: "project-not-found" };
  if (!project.organization.aiFeaturesEnabled) {
    return { available: false, reason: "organization-disabled" };
  }

  const model =
    env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL ?? env.LANGFUSE_AWS_BEDROCK_MODEL;
  if (!model) return { available: false, reason: "model-not-configured" };

  return {
    available: true,
    model,
    aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
  };
}
