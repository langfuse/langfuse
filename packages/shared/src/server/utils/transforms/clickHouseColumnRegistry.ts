import { observationsTableUiColumnDefinitions } from "../../../tableDefinitions/mapObservationsTable";
import { scoresTableUiColumnDefinitions } from "../../../tableDefinitions/mapScoresTable";
import { sessionCols } from "../../../tableDefinitions/mapSessionTable";
import { tracesTableCols } from "../../../tableDefinitions/tracesTable";

interface SimpleColumnEntry {
  id: string;
  name: string;
  sourceTable: string;
  internal: string;
  typeOverwrite?: string;
}

export class ColumnRegistry {
  private columns: Map<string, SimpleColumnEntry> = new Map();

  constructor() {
    this.registerExistingColumns();
  }

  private registerExistingColumns() {
    // Register traces columns
    tracesTableCols.forEach((col) => {
      this.columns.set(`traces.${col.id}`, {
        id: col.id,
        name: col.name,
        sourceTable: "traces",
        internal: col.internal,
      });
    });

    // Register observations columns
    observationsTableUiColumnDefinitions.forEach((col) => {
      this.columns.set(`${col.clickhouseTableName}.${col.uiTableId}`, {
        id: col.uiTableId,
        name: col.uiTableName,
        sourceTable: col.clickhouseTableName,
        internal: col.clickhouseSelect,
        typeOverwrite: col.clickhouseTypeOverwrite,
      });
    });

    // Register scores columns
    scoresTableUiColumnDefinitions.forEach((col) => {
      this.columns.set(`${col.clickhouseTableName}.${col.uiTableId}`, {
        id: col.uiTableId,
        name: col.uiTableName,
        sourceTable: col.clickhouseTableName,
        internal: col.clickhouseSelect,
        typeOverwrite: col.clickhouseTypeOverwrite,
      });
    });

    // Register session columns
    sessionCols.forEach((col) => {
      this.columns.set(`${col.clickhouseTableName}.${col.uiTableId}`, {
        id: col.uiTableId,
        name: col.uiTableName,
        sourceTable: col.clickhouseTableName,
        internal: col.clickhouseSelect,
        typeOverwrite: col.clickhouseTypeOverwrite,
      });
    });
  }

  getColumn(tableId: string, columnId: string): SimpleColumnEntry | undefined {
    return this.columns.get(`${tableId}.${columnId}`);
  }

  getAllColumns(): SimpleColumnEntry[] {
    return Array.from(this.columns.values());
  }
}

export function createColumnRegistry(): ColumnRegistry {
  return new ColumnRegistry();
}
