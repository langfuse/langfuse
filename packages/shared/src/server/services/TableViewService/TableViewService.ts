import { prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors";
import {
  SavedViewDomain,
  SavedViewDomainSchema,
  SavedViewNamesCreatorList,
  SavedViewNamesCreatorListSchema,
  UpdateSavedViewNameInput,
  type CreateSavedViewInput,
  type UpdateSavedViewInput,
} from "./types";

const TABLE_NAME_TO_URL_MAP = <Record<string, string>>{
  traces: "traces",
};

// TODO: Make this configurable
const BASE_URL = "http://localhost:3000/";

export class TableViewService {
  /**
   * Creates a saved view
   */
  public static async createSavedView(
    input: CreateSavedViewInput,
    createdBy: string,
  ): Promise<SavedViewDomain> {
    const newSavedView = await prisma.savedView.create({
      data: {
        createdBy,
        updatedBy: createdBy,
        ...input,
        orderBy: input.orderBy ?? undefined,
      },
    });

    return SavedViewDomainSchema.parse(newSavedView);
  }

  /**
   * Updates a saved view's definition
   */
  public static async updateSavedView(
    input: UpdateSavedViewInput,
    updatedBy: string,
  ): Promise<SavedViewDomain> {
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
        orderBy: input.orderBy ?? undefined,
        updatedBy,
      },
    });

    return SavedViewDomainSchema.parse(updatedSavedView);
  }

  /**
   * Updates a saved view's name
   */
  public static async updateSavedViewName(
    input: UpdateSavedViewNameInput,
    updatedBy: string,
  ): Promise<SavedViewDomain> {
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
        name: input.name,
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

  /**
   * Gets all saved views for a table
   */
  public static async getSavedViewsByTableName(
    tableName: string,
    projectId: string,
  ): Promise<SavedViewNamesCreatorList> {
    const savedViews = await prisma.savedView.findMany({
      where: {
        tableName,
        projectId,
      },
      select: {
        id: true,
        name: true,
        createdBy: true,
      },
    });

    return SavedViewNamesCreatorListSchema.parse(savedViews);
  }

  /**
   * Gets a saved view by id
   */
  public static async getSavedViewById(
    id: string,
    projectId: string,
  ): Promise<SavedViewDomain> {
    const savedView = await prisma.savedView.findUnique({
      where: {
        id,
        projectId,
      },
    });

    if (!savedView) {
      throw new LangfuseNotFoundError(
        `Saved view not found for id ${id} in project ${projectId}`,
      );
    }

    return SavedViewDomainSchema.parse(savedView);
  }

  /**
   * Generates a permanent link to a saved view
   */
  public static async generatePermalink(
    savedViewId: string,
    tableName: string,
    projectId: string,
  ): Promise<string> {
    const page = TABLE_NAME_TO_URL_MAP[tableName];
    return `${BASE_URL}/project/${projectId}/${page}?viewId=${savedViewId}`;
  }
}
