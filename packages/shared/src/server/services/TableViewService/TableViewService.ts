import { prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors";
import {
  SavedViewDomain,
  SavedViewDomainSchema,
  type CreateSavedViewInput,
  type UpdateSavedViewInput,
} from "./types";

export class TableViewService {
  /**
   * Creates a saved view
   */
  public static async createSavedView(
    input: CreateSavedViewInput,
    createdBy: string,
  ): Promise<SavedViewDomain> {
    const newDashboard = await prisma.savedView.create({
      data: {
        createdBy,
        updatedBy: createdBy,
        ...input,
      },
    });

    return SavedViewDomainSchema.parse(newDashboard);
  }

  /**
   * Updates a saved view's definition
   */
  public static async updateSavedView(
    input: UpdateSavedViewInput,
    updatedBy: string,
  ): Promise<SavedViewDomain> {
    // check if the saved view exists
    const savedView = await prisma.savedView.findUnique({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: input.tableName,
      },
    });

    if (!savedView) {
      throw new LangfuseNotFoundError(
        `Saved view not found for table ${input.tableName} in project ${input.projectId}`,
      );
    }

    const updatedSavedView = await prisma.savedView.update({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: input.tableName,
      },
      data: {
        ...input,
        updatedBy,
      },
    });

    return SavedViewDomainSchema.parse(updatedSavedView);
  }

  /**
   * Deletes a saved view
   */
  public static async deleteSavedView(
    savedViewId: string,
    projectId: string,
  ): Promise<void> {
    await prisma.savedView.delete({
      where: {
        id: savedViewId,
        projectId,
      },
    });
  }
}
