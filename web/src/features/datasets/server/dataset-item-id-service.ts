import { prisma } from "@langfuse/shared/src/db";

/**
 * Generate a user-friendly dataset item ID based on project name
 * Format: {PROJECT_NAME}-{SEQUENCE_NUMBER}
 * Example: AIR-0001, AIR-0002, etc.
 */
export class DatasetItemIdService {
  /**
   * Generate next friendly ID for a dataset item
   */
  static async generateFriendlyId(projectId: string): Promise<string> {
    // Get project information
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Normalize project name to be used as prefix
    const prefix = this.normalizeProjectName(project.name);

    // Get the next sequence number for this project
    const sequenceNumber = await this.getNextSequenceNumber(projectId, prefix);

    // Format sequence number with leading zeros (4 digits)
    const formattedSequence = sequenceNumber.toString().padStart(4, "0");

    return `${prefix}-${formattedSequence}`;
  }

  /**
   * Normalize project name to be used as ID prefix
   * - Convert to uppercase
   * - Replace spaces and special characters with underscores
   * - Limit to reasonable length
   */
  private static normalizeProjectName(name: string): string {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "_") // Replace non-alphanumeric with underscores
      .replace(/_+/g, "_") // Replace multiple underscores with single
      .replace(/^_|_$/g, "") // Remove leading/trailing underscores
      .substring(0, 10); // Limit to 10 characters to keep IDs reasonable
  }

  /**
   * Get the next sequence number for dataset items in a project
   * This uses atomic upsert operations to ensure thread safety and avoid concurrency issues
   */
  private static async getNextSequenceNumber(
    projectId: string,
    prefix: string,
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // Try to increment existing counter or create new one
      const result = await tx.sequenceCounter.upsert({
        where: {
          projectId_entityType_prefix: {
            projectId,
            entityType: "dataset_item",
            prefix,
          },
        },
        update: {
          sequence: {
            increment: 1,
          },
        },
        create: {
          projectId,
          entityType: "dataset_item",
          prefix,
          sequence: await this.getInitialSequenceNumber(tx, projectId, prefix),
        },
        select: {
          sequence: true,
        },
      });

      return result.sequence;
    });
  }

  /**
   * Calculate the initial sequence number by finding the highest existing sequence
   * This is only called when creating a new sequence counter
   */
  private static async getInitialSequenceNumber(
    tx: any,
    projectId: string,
    prefix: string,
  ): Promise<number> {
    // Find the highest sequence number for this project's dataset items
    const existingItems = await tx.datasetItem.findMany({
      where: {
        projectId,
        id: {
          startsWith: `${prefix}-`,
        },
      },
      select: { id: true },
    });

    let maxSequence = 0;

    // Extract sequence numbers from existing IDs
    for (const item of existingItems) {
      const match = item.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        const sequence = parseInt(match[1], 10);
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }

    return maxSequence + 1;
  }

  /**
   * Check if an ID follows the friendly format
   */
  static isFriendlyId(id: string): boolean {
    return /^[A-Z_]{1,10}-\d{4}$/.test(id);
  }

  /**
   * Extract prefix from a friendly ID
   */
  static extractPrefix(id: string): string | null {
    const match = id.match(/^([A-Z_]{1,10})-\d{4}$/);
    return match ? match[1] : null;
  }

  /**
   * Extract sequence number from a friendly ID
   */
  static extractSequence(id: string): number | null {
    const match = id.match(/^[A-Z_]{1,10}-(\d{4})$/);
    return match ? parseInt(match[1], 10) : null;
  }
}
