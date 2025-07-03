import { type PrismaClient } from "@langfuse/shared/src/db";

export class DatasetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async updateTemplate(
    projectId: string,
    datasetId: string,
    template: { input?: any; expectedOutput?: any; metadata?: any },
  ) {
    return this.prisma.dataset.update({
      where: {
        id_projectId: {
          id: datasetId,
          projectId,
        },
      },
      data: {
        inputTemplate: template.input,
        expectedOutputTemplate: template.expectedOutput,
        metadataTemplate: template.metadata,
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        description: true,
        metadata: true,
        inputTemplate: true,
        expectedOutputTemplate: true,
        metadataTemplate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getTemplate(projectId: string, datasetId: string) {
    const dataset = await this.prisma.dataset.findUnique({
      where: {
        id_projectId: {
          id: datasetId,
          projectId,
        },
      },
      select: {
        inputTemplate: true,
        expectedOutputTemplate: true,
        metadataTemplate: true,
      },
    });

    if (!dataset) {
      return null;
    }

    return {
      input: dataset.inputTemplate,
      expectedOutput: dataset.expectedOutputTemplate,
      metadata: dataset.metadataTemplate,
    };
  }
}
