import { useEffect, useState } from "react";
import { type CsvColumnPreview } from "@/src/features/datasets/lib/csvHelpers";
import { findDefaultColumn } from "../lib/findDefaultColumn";

type CsvMappingState = {
  // Freeform mode
  selectedInputColumn: Set<string>;
  selectedExpectedColumn: Set<string>;
  selectedMetadataColumn: Set<string>;
  excludedColumns: Set<string>;

  // Schema mode
  inputSchemaMapping: Map<string, CsvColumnPreview[]>;
  expectedOutputSchemaMapping: Map<string, CsvColumnPreview[]>;
  unmappedColumns: Set<string>;
};

type CsvMappingActions = {
  setSelectedInputColumn: (columns: Set<string>) => void;
  setSelectedExpectedColumn: (columns: Set<string>) => void;
  setSelectedMetadataColumn: (columns: Set<string>) => void;
  setInputSchemaMapping: (mapping: Map<string, CsvColumnPreview[]>) => void;
  setExpectedOutputSchemaMapping: (
    mapping: Map<string, CsvColumnPreview[]>,
  ) => void;
  removeFromAllMappings: (columnName: string) => void;
  reset: () => void;
};

const initialState: CsvMappingState = {
  selectedInputColumn: new Set(),
  selectedExpectedColumn: new Set(),
  selectedMetadataColumn: new Set(),
  excludedColumns: new Set(),
  inputSchemaMapping: new Map(),
  expectedOutputSchemaMapping: new Map(),
  unmappedColumns: new Set(),
};

export function useCsvMapping({
  preview,
  isSchemaMode,
}: {
  preview: { columns: CsvColumnPreview[] } | null;
  isSchemaMode: boolean;
}): CsvMappingState & CsvMappingActions {
  const [state, setState] = useState<CsvMappingState>(initialState);

  // Initialize defaults on mount
  useEffect(() => {
    if (!preview) return;

    if (!isSchemaMode) {
      // Freeform mode: set defaults only if no columns selected
      if (
        state.selectedInputColumn.size === 0 &&
        state.selectedExpectedColumn.size === 0 &&
        state.selectedMetadataColumn.size === 0
      ) {
        const defaultInput = findDefaultColumn(preview.columns, "Input", 0);
        const defaultExpected = findDefaultColumn(
          preview.columns,
          "Expected",
          1,
        );
        const defaultMetadata = findDefaultColumn(
          preview.columns,
          "Metadata",
          2,
        );

        const newExcluded = new Set(
          preview.columns
            .filter(
              (col) =>
                defaultInput !== col.name &&
                defaultExpected !== col.name &&
                defaultMetadata !== col.name,
            )
            .map((col) => col.name),
        );

        setState((prev) => ({
          ...prev,
          selectedInputColumn: defaultInput
            ? new Set([defaultInput])
            : new Set(),
          selectedExpectedColumn: defaultExpected
            ? new Set([defaultExpected])
            : new Set(),
          selectedMetadataColumn: defaultMetadata
            ? new Set([defaultMetadata])
            : new Set(),
          excludedColumns: newExcluded,
        }));
      }
    } else {
      // Schema mode: initialize unmapped columns
      if (state.unmappedColumns.size === 0) {
        setState((prev) => ({
          ...prev,
          unmappedColumns: new Set(preview.columns.map((col) => col.name)),
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, isSchemaMode]);

  const removeFromAllMappings = (columnName: string) => {
    setState((prev) => {
      // Remove from input schema mapping
      const inputMapping = new Map(prev.inputSchemaMapping);
      for (const [key, cols] of inputMapping.entries()) {
        const filtered = cols.filter((c) => c.name !== columnName);
        if (filtered.length === 0) {
          inputMapping.delete(key);
        } else if (filtered.length !== cols.length) {
          inputMapping.set(key, filtered);
        }
      }

      // Remove from expected schema mapping
      const expectedMapping = new Map(prev.expectedOutputSchemaMapping);
      for (const [key, cols] of expectedMapping.entries()) {
        const filtered = cols.filter((c) => c.name !== columnName);
        if (filtered.length === 0) {
          expectedMapping.delete(key);
        } else if (filtered.length !== cols.length) {
          expectedMapping.set(key, filtered);
        }
      }

      // Remove from freeform selections
      const newInputColumn = new Set(prev.selectedInputColumn);
      const newExpectedColumn = new Set(prev.selectedExpectedColumn);
      const newMetadataColumn = new Set(prev.selectedMetadataColumn);
      newInputColumn.delete(columnName);
      newExpectedColumn.delete(columnName);
      newMetadataColumn.delete(columnName);

      return {
        ...prev,
        inputSchemaMapping: inputMapping,
        expectedOutputSchemaMapping: expectedMapping,
        selectedInputColumn: newInputColumn,
        selectedExpectedColumn: newExpectedColumn,
        selectedMetadataColumn: newMetadataColumn,
      };
    });
  };

  return {
    ...state,
    setSelectedInputColumn: (columns) =>
      setState((prev) => ({ ...prev, selectedInputColumn: columns })),
    setSelectedExpectedColumn: (columns) =>
      setState((prev) => ({ ...prev, selectedExpectedColumn: columns })),
    setSelectedMetadataColumn: (columns) =>
      setState((prev) => ({ ...prev, selectedMetadataColumn: columns })),
    setInputSchemaMapping: (mapping) =>
      setState((prev) => ({ ...prev, inputSchemaMapping: mapping })),
    setExpectedOutputSchemaMapping: (mapping) =>
      setState((prev) => ({ ...prev, expectedOutputSchemaMapping: mapping })),
    removeFromAllMappings,
    reset: () => setState(initialState),
  };
}
