import { prisma } from "../../../src/db";
import { encrypt } from "../../../src/encryption";

/** The forecast reads model names and catalog prices without contacting a provider. */
export async function prepareTopicsCostEstimate(
  projectId: string,
  embedding: { embeddingModel: string; dimensions: number },
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.topicConfig.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (existing) return;

    const connection = await tx.llmApiKeys.upsert({
      where: { id: `${projectId}-topics-cost-seed` },
      update: {},
      create: {
        id: `${projectId}-topics-cost-seed`,
        projectId,
        provider: "Topics cost seed",
        adapter: "openai",
        baseURL: "https://topics-cost-seed.invalid/v1",
        secretKey: encrypt("synthetic-topics-cost-seed"),
        displaySecretKey: "synthetic",
        customModels: ["gpt-4o-mini", embedding.embeddingModel],
        withDefaultModels: false,
      },
      select: { id: true },
    });
    await tx.topicConfig.upsert({
      where: { projectId },
      update: {},
      create: {
        projectId,
        enabled: false,
        summaryLlmApiKeyId: connection.id,
        summaryModel: "gpt-4o-mini",
        embeddingLlmApiKeyId: connection.id,
        embeddingModel: embedding.embeddingModel,
        embeddingDimensions: embedding.dimensions,
        clusteringLlmApiKeyId: connection.id,
        clusteringModel: "gpt-4o-mini",
      },
    });
  });
}
