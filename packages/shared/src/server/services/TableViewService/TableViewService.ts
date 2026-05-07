import { Prisma } from "@prisma/client";
import { prisma } from "../../../db";
import {
  TableViewPresetTableName,
  type TableViewPresetDomain,
} from "../../../domain/table-view-presets";
import { LangfuseConflictError, LangfuseNotFoundError } from "../../../errors";
import {
  TableViewPresetsNamesCreatorList,
  TableViewPresetsNamesCreatorListSchema,
  UpdateTableViewPresetsNameInput,
  type CreateTableViewPresetsInput,
  type UpdateTableViewPresetsInput,
} from "./types";

const TABLE_NAME_TO_URL_MAP: Partial<Record<TableViewPresetTableName, string>> =
  {
    [TableViewPresetTableName.Traces]: "traces",
    [TableViewPresetTableName.Observations]: "observations",
    [TableViewPresetTableName.ObservationsEvents]: "traces",
    [TableViewPresetTableName.Scores]: "scores",
    [TableViewPresetTableName.Sessions]: "sessions",
    [TableViewPresetTableName.Datasets]: "datasets",
    [TableViewPresetTableName.Experiments]: "experiments",
    [TableViewPresetTableName.ExperimentItems]: "experiments/results",
  };

// The v4 table was mistakenly released under the `observations` table name,
// so we need to read legacy presets that belong to the events table under the `observations` name.
// To avoid proliferating this compatibility logic, we only apply it when reading presets for the events table,
// and we never allow it when writing (creating/updating) presets.
const getReadCompatibleTableNames = (
  tableName: TableViewPresetTableName,
): TableViewPresetTableName[] =>
  tableName === TableViewPresetTableName.ObservationsEvents
    ? [
        TableViewPresetTableName.ObservationsEvents,
        TableViewPresetTableName.Observations,
      ]
    : [tableName];

const TABLE_VIEW_PRESET_NAME_CONFLICT_MESSAGE =
  "Table view preset with this name already exists. Please choose a different name.";

const throwTableViewPresetConflictIfDuplicateName = (error: unknown): never => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new LangfuseConflictError(TABLE_VIEW_PRESET_NAME_CONFLICT_MESSAGE);
  }

  throw error;
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
    const tableViewPresets = await prisma.tableViewPreset.findFirst({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: {
          in: getReadCompatibleTableNames(input.tableName),
        },
      },
    });

    if (!tableViewPresets) {
      throw new LangfuseNotFoundError(
        `Saved table view preset not found for table ${input.tableName} in project ${input.projectId}`,
      );
    }

    try {
      const updatedTableViewPresets = await prisma.tableViewPreset.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          name: input.name,
          tableName: input.tableName,
          filters: input.filters,
          columnOrder: input.columnOrder,
          columnVisibility: input.columnVisibility,
          searchQuery: input.searchQuery,
          orderBy: input.orderBy ?? undefined,
          updatedBy,
        },
      });

      return updatedTableViewPresets as unknown as TableViewPresetDomain;
    } catch (error) {
      return throwTableViewPresetConflictIfDuplicateName(error);
    }
  }

  /**
   * Updates a table view preset's name
   */
  public static async updateTableViewPresetsName(
    input: UpdateTableViewPresetsNameInput,
    updatedBy: string,
  ): Promise<TableViewPresetDomain> {
    const tableViewPresets = await prisma.tableViewPreset.findFirst({
      where: {
        id: input.id,
        projectId: input.projectId,
        tableName: {
          in: getReadCompatibleTableNames(input.tableName),
        },
      },
    });

    if (!tableViewPresets) {
      throw new LangfuseNotFoundError(
        `Saved table view preset not found for table ${input.tableName} in project ${input.projectId}`,
      );
    }

    try {
      const updatedTableViewPresets = await prisma.tableViewPreset.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          name: input.name,
          tableName: input.tableName,
          updatedBy,
        },
      });

      return updatedTableViewPresets as unknown as TableViewPresetDomain;
    } catch (error) {
      return throwTableViewPresetConflictIfDuplicateName(error);
    }
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
    tableName: TableViewPresetTableName,
    projectId: string,
  ): Promise<TableViewPresetsNamesCreatorList> {
    const records = await prisma.tableViewPreset.findMany({
      where: {
        tableName: {
          in: getReadCompatibleTableNames(tableName),
        },
        projectId,
      },
      select: {
        id: true,
        name: true,
        tableName: true,
        createdBy: true,
        createdByUser: {
          select: {
            image: true,
            name: true,
          },
        },
        filters: true,
        columnOrder: true,
        columnVisibility: true,
        searchQuery: true,
        orderBy: true,
      },
    });

    const presets = TableViewPresetsNamesCreatorListSchema.parse(records);

    if (tableName === TableViewPresetTableName.ObservationsEvents) {
      // Deduplicate presets that have the same name,
      // preferring presets that belong to the canonical events table namespace
      // over presets that belong to the legacy observations namespace.
      const presetsByName = new Map<
        string,
        TableViewPresetsNamesCreatorList[number]
      >();

      for (const preset of presets) {
        const existingPreset = presetsByName.get(preset.name);

        if (
          !existingPreset ||
          (preset.tableName === TableViewPresetTableName.ObservationsEvents &&
            existingPreset.tableName === TableViewPresetTableName.Observations)
        ) {
          presetsByName.set(preset.name, preset);
        }
      }

      return Array.from(presetsByName.values());
    }

    return presets;
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
    if (!page) {
      throw new Error(`Permalinks are not supported for table ${tableName}`);
    }
    return `${baseUrl}/project/${projectId}/${page}?viewId=${TableViewPresetsId}`;
  }
}
