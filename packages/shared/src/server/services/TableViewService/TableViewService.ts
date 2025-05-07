import { prisma } from "../../../db";
import {
  TableViewPresetTableName,
  type TableViewPresetDomain,
} from "../../../domain/table-view-presets";
import { LangfuseNotFoundError } from "../../../errors";
import {
  TableViewPresetsNamesCreatorList,
  TableViewPresetsNamesCreatorListSchema,
  UpdateTableViewPresetsNameInput,
  type CreateTableViewPresetsInput,
  type UpdateTableViewPresetsInput,
} from "./types";

const TABLE_NAME_TO_URL_MAP = <Record<TableViewPresetTableName, string>>{
  [TableViewPresetTableName.Traces]: "traces",
  [TableViewPresetTableName.Observations]: "observations",
  [TableViewPresetTableName.Scores]: "scores",
  [TableViewPresetTableName.Sessions]: "sessions",
};

export class TableViewService {
  /**
   * Creates a table view preset
   */
  public static async createTableViewPresets(
    input: CreateTableViewPresetsInput,
    createdBy: string,
  ): Promise<TableViewPresetDomain> {
    const newTableViewPresets = await prisma.tableViewPreset.create({
      data: {
        createdBy,
        updatedBy: createdBy,
        ...input,
        orderBy: input.orderBy ?? undefined,
      },
    });

    return newTableViewPresets as unknown as TableViewPresetDomain;
  }

  /**
   * Updates a table view preset's definition
   */
  public static async updateTableViewPresets(
    input: UpdateTableViewPresetsInput,
    updatedBy: string,
  ): Promise<TableViewPresetDomain> {
    const tableViewPresets = await prisma.tableViewPreset.findUnique({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: input.tableName,
      },
    });

    if (!tableViewPresets) {
      throw new LangfuseNotFoundError(
        `Saved table view preset not found for table ${input.tableName} in project ${input.projectId}`,
      );
    }

    const updatedTableViewPresets = await prisma.tableViewPreset.update({
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

    return updatedTableViewPresets as unknown as TableViewPresetDomain;
  }

  /**
   * Updates a table view preset's name
   */
  public static async updateTableViewPresetsName(
    input: UpdateTableViewPresetsNameInput,
    updatedBy: string,
  ): Promise<TableViewPresetDomain> {
    const tableViewPresets = await prisma.tableViewPreset.findUnique({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: input.tableName,
      },
    });

    if (!tableViewPresets) {
      throw new LangfuseNotFoundError(
        `Saved table view preset not found for table ${input.tableName} in project ${input.projectId}`,
      );
    }

    const updatedTableViewPresets = await prisma.tableViewPreset.update({
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

    return updatedTableViewPresets as unknown as TableViewPresetDomain;
  }

  /**
   * Deletes a table view preset
   */
  public static async deleteTableViewPresets(
    TableViewPresetsId: string,
    projectId: string,
  ): Promise<void> {
    await prisma.tableViewPreset.delete({
      where: {
        id: TableViewPresetsId,
        projectId,
      },
    });
  }

  /**
   * Gets all table view presets for a table
   */
  public static async getTableViewPresetsByTableName(
    tableName: string,
    projectId: string,
  ): Promise<TableViewPresetsNamesCreatorList> {
    const TableViewPresets = await prisma.tableViewPreset.findMany({
      where: {
        tableName,
        projectId,
      },
      select: {
        id: true,
        name: true,
        createdBy: true,
        createdByUser: {
          select: {
            image: true,
            name: true,
          },
        },
      },
    });

    return TableViewPresetsNamesCreatorListSchema.parse(TableViewPresets);
  }

  /**
   * Gets a table view preset by id
   */
  public static async getTableViewPresetsById(
    id: string,
    projectId: string,
  ): Promise<TableViewPresetDomain> {
    const tableViewPresets = await prisma.tableViewPreset.findUnique({
      where: {
        id,
        projectId,
      },
    });

    if (!tableViewPresets) {
      throw new LangfuseNotFoundError(
        `Saved table view preset not found for id ${id} in project ${projectId}`,
      );
    }

    return tableViewPresets as unknown as TableViewPresetDomain;
  }

  /**
   * Generates a permanent link to a table view preset
   */
  public static async generatePermalink(
    baseUrl: string,
    TableViewPresetsId: string,
    tableName: TableViewPresetTableName,
    projectId: string,
  ): Promise<string> {
    const page = TABLE_NAME_TO_URL_MAP[tableName];
    return `${baseUrl}/project/${projectId}/${page}?viewId=${TableViewPresetsId}`;
  }
}
